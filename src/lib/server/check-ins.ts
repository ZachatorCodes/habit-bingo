import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { backfillMonths, canLog } from '#lib/game/backfill.ts';
import { highlightChanges } from '#lib/game/feed.ts';
import { highlightState } from '#lib/server/card-view.ts';
import { NOTHING_POSTED, syncCheckIn, syncHighlights } from '#lib/server/feed.ts';
import { localDate } from '#lib/server/clock.ts';
import type { CardSize } from '#lib/game/card-layout.ts';
import type { Db } from '#lib/server/db/client.ts';
import { card, cardSquare, checkIn, habit } from '#lib/server/db/schema.ts';

/** A square's count on one date stops here (spec §3.2). */
export const MAX_COUNT = 20;

/** Every check-in on a card: square id → date → count. */
export async function getCheckIns(
	db: Db,
	cardId: string
): Promise<Map<string, Map<string, number>>> {
	const rows = await db
		.select({ squareId: checkIn.squareId, date: checkIn.date, count: checkIn.count })
		.from(checkIn)
		.innerJoin(cardSquare, eq(cardSquare.id, checkIn.squareId))
		.where(eq(cardSquare.cardId, cardId));
	const bySquare = new Map<string, Map<string, number>>();
	for (const row of rows) {
		const dates = bySquare.get(row.squareId) ?? new Map<string, number>();
		dates.set(row.date, row.count);
		bySquare.set(row.squareId, dates);
	}
	return bySquare;
}

type CheckInResult =
	{ ok: true; count: number } | { ok: false; field: 'date' | 'count'; message: string } | null;

/**
 * Whether the person may change check-ins on this square and date: null when it isn't a habit
 * square of their card for this month, or last month's on the 1st–3rd (the route answers 404); a refusal
 * for a day outside the card's month, before it started or after today (spec §3.1); otherwise ok.
 */
async function checkLoggable(
	db: Db,
	user: { id: string; timezone: string },
	squareId: string,
	date: string,
	now: Date
): Promise<CheckInResult> {
	const today = localDate(now, user.timezone);
	const [square] = await db
		.select({ startDate: card.startDate })
		.from(cardSquare)
		.innerJoin(card, eq(card.id, cardSquare.cardId))
		.where(
			and(
				eq(cardSquare.id, squareId),
				eq(cardSquare.isCenter, false),
				eq(card.userId, user.id),
				inArray(card.month, backfillMonths(today))
			)
		);
	if (!square) return null;
	if (!canLog(date, today, square.startDate)) {
		return {
			ok: false,
			field: 'date',
			message: "You can log any day of this card's month, up to today."
		};
	}
	return { ok: true, count: 0 };
}

/**
 * Runs a check-in write, then posts every highlight now true and retracts what is no longer. The card row lock
 * makes simultaneous check-ins on one card take turns, so a shared line posts its bingo once.
 */
async function withHighlights(
	db: Db,
	userId: string,
	squareId: string,
	date: string,
	today: string,
	now: Date,
	write: (tx: Db) => Promise<CheckInResult>
): Promise<CheckInResult> {
	return db.transaction(async (tx) => {
		const [{ cardId, size, nowPrivate }] = await tx
			.select({ cardId: cardSquare.cardId, size: card.size, nowPrivate: habit.isPrivate })
			.from(cardSquare)
			.innerJoin(card, eq(card.id, cardSquare.cardId))
			.leftJoin(habit, eq(habit.id, cardSquare.habitId))
			.where(eq(cardSquare.id, squareId));
		await tx.execute(sql`select id from card where id = ${cardId} for update`);
		const result = await write(tx);
		const after = await highlightState(tx, cardId, today);
		// A habit made private since the card started is private in the feed too.
		const squares = after.squares.map((s) =>
			s.id === squareId ? { ...s, isPrivate: s.isPrivate || nowPrivate === true } : s
		);
		await syncHighlights(
			tx,
			{ id: cardId, userId, size: size as CardSize },
			squares,
			highlightChanges(NOTHING_POSTED, after.state)
		);
		const square = squares.find((s) => s.id === squareId);
		if (result?.ok && square) {
			await syncCheckIn(tx, { id: cardId, userId }, square, date, result.count, today, now);
		}
		return result;
	});
}

/** Adds (+1) or removes (−1) one check-in on a square and date (see `checkLoggable`). */
export async function logCheckIn(
	db: Db,
	user: { id: string; timezone: string },
	squareId: string,
	date: string,
	delta: 1 | -1,
	now: Date
): Promise<CheckInResult> {
	const allowed = await checkLoggable(db, user, squareId, date, now);
	if (!allowed?.ok) return allowed;

	return withHighlights(
		db,
		user.id,
		squareId,
		date,
		localDate(now, user.timezone),
		now,
		async (tx) => {
			const where = and(eq(checkIn.squareId, squareId), eq(checkIn.date, date));
			if (delta === 1) {
				// One statement, so simultaneous taps each count.
				const [row] = await tx
					.insert(checkIn)
					.values({ id: crypto.randomUUID(), squareId, date, count: 1 })
					.onConflictDoUpdate({
						target: [checkIn.squareId, checkIn.date],
						set: { count: sql`least(${checkIn.count} + 1, ${MAX_COUNT})`, updatedAt: now }
					})
					.returning({ count: checkIn.count });
				return { ok: true, count: row.count };
			}
			// Decrement only above 1, then delete at 1: each statement re-checks its condition under the
			// row lock, so simultaneous undos each count once and never break the 1–20 CHECK.
			const [row] = await tx
				.update(checkIn)
				.set({ count: sql`${checkIn.count} - 1`, updatedAt: now })
				.where(and(where, gt(checkIn.count, 1)))
				.returning({ count: checkIn.count });
			if (row) return { ok: true, count: row.count };
			await tx.delete(checkIn).where(and(where, eq(checkIn.count, 1)));
			return { ok: true, count: 0 };
		}
	);
}

/**
 * Sets a square's count for a date (0–20; 0 removes it) — the habit sheet's "Done that day" toggle,
 * which turns a day off even when it was logged more than once. Same rules as `logCheckIn`.
 */
export async function setCheckIn(
	db: Db,
	user: { id: string; timezone: string },
	squareId: string,
	date: string,
	count: number,
	now: Date
): Promise<CheckInResult> {
	const allowed = await checkLoggable(db, user, squareId, date, now);
	if (!allowed?.ok) return allowed;
	if (!Number.isFinite(count))
		return { ok: false, field: 'count', message: `Pick a number from 0 to ${MAX_COUNT}.` };
	const value = Math.min(Math.max(Math.trunc(count), 0), MAX_COUNT);
	return withHighlights(
		db,
		user.id,
		squareId,
		date,
		localDate(now, user.timezone),
		now,
		async (tx) => {
			const where = and(eq(checkIn.squareId, squareId), eq(checkIn.date, date));
			if (value === 0) {
				await tx.delete(checkIn).where(where);
				return { ok: true, count: 0 };
			}
			await tx
				.insert(checkIn)
				.values({ id: crypto.randomUUID(), squareId, date, count: value })
				.onConflictDoUpdate({
					target: [checkIn.squareId, checkIn.date],
					set: { count: value, updatedAt: now }
				});
			return { ok: true, count: value };
		}
	);
}
