import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { monthOf } from '#lib/game/calendar.ts';
import { isFinal } from '#lib/game/recap.ts';
import { highlightChanges } from '#lib/game/feed.ts';
import { cardView, highlightState } from '#lib/server/card-view.ts';
import { getCard } from '#lib/server/cards.ts';
import type { Db } from '#lib/server/db/client.ts';
import { card, monthResult } from '#lib/server/db/schema.ts';
import { NOTHING_POSTED, syncHighlights } from '#lib/server/feed.ts';

export type MonthResult = typeof monthResult.$inferSelect;

/**
 * Saves a result for each of the person's past cards that is final and has none (spec §3.8),
 * scored as of `today` (their local date). Idempotent: a second run, or one racing it, saves nothing.
 */
export async function finalizeMonths(db: Db, userId: string, today: string): Promise<void> {
	const pending = await db
		.select({ month: card.month })
		.from(card)
		.leftJoin(
			monthResult,
			and(eq(monthResult.userId, card.userId), eq(monthResult.month, card.month))
		)
		.where(and(eq(card.userId, userId), lt(card.month, monthOf(today)), isNull(monthResult.month)));
	for (const { month } of pending) {
		if (!isFinal(month, today)) continue;
		const finished = (await getCard(db, userId, month))!;
		const { score } = await cardView(db, userId, finished, today);
		await db
			.insert(monthResult)
			.values({
				userId,
				month,
				lines: score.lines.length,
				tiers: score.tiers,
				squaresCounting: score.counting,
				size: finished.size
			})
			.onConflictDoNothing();
		// Rewards reached by the month ending had no check-in to post them.
		const now = await highlightState(db, finished.id, today);
		await syncHighlights(
			db,
			{ id: finished.id, userId, size: finished.size },
			now.squares,
			highlightChanges(NOTHING_POSTED, now.state)
		);
	}
}

/** The person's results, newest month first. */
export async function listResults(db: Db, userId: string): Promise<MonthResult[]> {
	return db
		.select()
		.from(monthResult)
		.where(eq(monthResult.userId, userId))
		.orderBy(desc(monthResult.month));
}

export async function getResult(
	db: Db,
	userId: string,
	month: string
): Promise<MonthResult | null> {
	const [row] = await db
		.select()
		.from(monthResult)
		.where(and(eq(monthResult.userId, userId), eq(monthResult.month, month)));
	return row ?? null;
}

/** The newest result, while its recap is unopened (Today's banner, spec §4.11). */
export async function newestUnseen(db: Db, userId: string): Promise<MonthResult | null> {
	const [newest] = await listResults(db, userId);
	return newest && newest.seenAt === null ? newest : null;
}

/** Marks the person's recap for `month` seen; nothing for a month they have no result for. */
export async function markSeen(db: Db, userId: string, month: string, now: Date): Promise<void> {
	await db
		.update(monthResult)
		.set({ seenAt: now })
		.where(
			and(eq(monthResult.userId, userId), eq(monthResult.month, month), isNull(monthResult.seenAt))
		);
}
