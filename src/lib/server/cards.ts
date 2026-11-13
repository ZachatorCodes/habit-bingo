// Monthly cards: a snapshot of nine or twenty-four habits, laid out on a board. Every query is
// scoped to the signed-in user.
import { and, asc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { monthName, monthOf, nextMonth } from '#lib/game/calendar.ts';
import { CARD_SIZES, isValidLayout, type CardSize } from '#lib/game/card-layout.ts';
import type { CategoryId } from '#lib/game/categories.ts';
import { normalizeRule, targetRange, type HabitRule } from '#lib/game/habit-rules.ts';
import { highlightChanges } from '#lib/game/feed.ts';
import { canBuildNextMonth } from '#lib/game/next-month.ts';
import { prorateTarget } from '#lib/game/proration.ts';
import type { IconName } from '#lib/icons.ts';
import { isUniqueViolation } from '#lib/server/auth/sign-up.ts';
import { localDate, startOfLocalDay } from '#lib/server/clock.ts';
import type { Db } from '#lib/server/db/client.ts';
import { card, cardSquare, feedEvent } from '#lib/server/db/schema.ts';
import { postCardStarted, syncHighlights } from '#lib/server/feed.ts';
import { highlightState } from '#lib/server/card-view.ts';
import { listHabits, type Habit } from '#lib/server/habits.ts';

const EDIT_WINDOW_MS = 48 * 3_600_000;

export type Rewards = { bingo: string; sixty: string; blackout: string };
type WeekStart = 'monday' | 'sunday';

export type CardSquare =
	| { id: string; position: number; isCenter: true }
	| ({
			id: string;
			position: number;
			isCenter: false;
			habitId: string | null;
			icon: IconName;
			name: string;
			category: CategoryId;
			isPrivate: boolean;
	  } & HabitRule);

export type Card = {
	id: string;
	month: string;
	size: CardSize;
	startDate: string;
	editableUntil: Date;
	weekStartsOn: WeekStart;
	rewards: Rewards;
	squares: CardSquare[];
};

export type CardPlan = {
	size: CardSize;
	habitIds: string[];
	/** Overrides only; a missing habit gets its prorated target. */
	targets: Record<string, number>;
	rewards: Rewards;
	/** Habit ids by board position, null at the center square. */
	layout: (string | null)[];
	/** The card's month: the person's current month (the default) or, in its last 7 days, the next. */
	month?: string;
};

export type CardError = {
	ok: false;
	field: 'exists' | 'locked' | 'month' | 'habits' | 'targets' | 'layout' | keyof Rewards;
	message: string;
};

const REWARD_MESSAGE = 'Write a reward (up to 80 characters).';

export function validateRewards(input: Rewards): { ok: true; value: Rewards } | CardError {
	const value = { bingo: '', sixty: '', blackout: '' };
	for (const field of ['bingo', 'sixty', 'blackout'] as const) {
		const text = input[field].trim();
		if (text.length < 1 || text.length > 80) return { ok: false, field, message: REWARD_MESSAGE };
		value[field] = text;
	}
	return { ok: true, value };
}

export function currentMonth(user: { timezone: string }, now: Date): string {
	return monthOf(localDate(now, user.timezone));
}

export function isEditable(card: Pick<Card, 'editableUntil'>, now: Date): boolean {
	return now.getTime() < card.editableUntil.getTime();
}

/**
 * Whether a draft that is editing a card (`draftCardId`) can no longer be used: the card it points
 * at is gone, is another one, or is past its edit window. A draft that is not editing is never
 * blocked.
 */
export function editBlocked(
	draftCardId: string | null,
	card: Pick<Card, 'id' | 'editableUntil'> | null,
	now: Date
): boolean {
	if (draftCardId === null) return false;
	return !card || card.id !== draftCardId || !isEditable(card, now);
}

function toCard(row: typeof card.$inferSelect, squares: (typeof cardSquare.$inferSelect)[]): Card {
	return {
		id: row.id,
		month: row.month,
		size: row.size as CardSize,
		startDate: row.startDate,
		editableUntil: row.editableUntil,
		weekStartsOn: row.weekStartsOn as WeekStart,
		rewards: { bingo: row.rewardBingo, sixty: row.rewardSixty, blackout: row.rewardBlackout },
		squares: squares
			.slice()
			.sort((a, b) => a.position - b.position)
			.map((s): CardSquare => {
				if (s.isCenter) return { id: s.id, position: s.position, isCenter: true };
				return {
					id: s.id,
					position: s.position,
					isCenter: false,
					habitId: s.habitId,
					icon: s.icon as IconName,
					name: s.name!,
					category: s.category as CategoryId,
					direction: s.direction as HabitRule['direction'],
					period: s.period as HabitRule['period'],
					countMode: s.countMode as HabitRule['countMode'],
					target: s.target!,
					isPrivate: s.isPrivate!
				};
			})
	};
}

export async function getCard(db: Db, userId: string, month: string): Promise<Card | null> {
	return loadCard(db, and(eq(card.userId, userId), eq(card.month, month)));
}

/** One of the person's cards by id; null for an id that is not theirs. */
export async function getCardById(db: Db, userId: string, cardId: string): Promise<Card | null> {
	return loadCard(db, and(eq(card.userId, userId), eq(card.id, cardId)));
}

async function loadCard(db: Db, where: SQL | undefined): Promise<Card | null> {
	const [row] = await db.select().from(card).where(where);
	if (!row) return null;
	const squares = await db
		.select()
		.from(cardSquare)
		.where(eq(cardSquare.cardId, row.id))
		.orderBy(asc(cardSquare.position));
	return toCard(row, squares);
}

type Resolved = {
	rewards: Rewards;
	/**
	 * By board position, null at the FREE square. `habit` is set for habits new to the card, which
	 * get a fresh snapshot; a habit already on the card keeps its square as it is.
	 */
	board: ({ habitId: string; target: number; habit: Habit | null } | null)[];
};

type KeptSquare = Extract<CardSquare, { isCenter: false }>;

/**
 * Checks a plan and works out each square's target. Habits must be the person's active habits,
 * except ones already on the card (`kept`, by habit id), which stay as snapshotted: their rule is
 * the square's, and their target only changes through an override.
 */
async function resolvePlan(
	db: Db,
	userId: string,
	size: CardSize,
	plan: Omit<CardPlan, 'size'>,
	startDate: string,
	kept: ReadonlyMap<string, KeptSquare> = new Map()
): Promise<{ ok: true; value: Resolved } | CardError> {
	const active = new Map((await listHabits(db, userId)).map((h) => [h.id, h]));
	const ids = plan.habitIds;
	if (
		ids.length !== CARD_SIZES[size].habits ||
		new Set(ids).size !== ids.length ||
		ids.some((id) => !active.has(id) && !kept.has(id))
	) {
		return { ok: false, field: 'habits', message: 'Pick from your habits.' };
	}

	const targets = new Map<string, number>();
	for (const id of ids) {
		const source = kept.get(id) ?? active.get(id)!;
		const override = Object.hasOwn(plan.targets, id) ? plan.targets[id] : undefined;
		if (override === undefined) {
			targets.set(id, kept.has(id) ? kept.get(id)!.target : prorateTarget(source, startDate));
			continue;
		}
		const rule = normalizeRule({ ...source, target: override });
		if (!rule.ok) {
			const { min, max } = targetRange(source.direction, source.period, source.countMode);
			return {
				ok: false,
				field: 'targets',
				message: `Pick a number from ${min} to ${max} for ${source.name}.`
			};
		}
		targets.set(id, rule.rule.target);
	}

	if (!isValidLayout(plan.layout, ids, size)) {
		return { ok: false, field: 'layout', message: 'Shuffle the board again.' };
	}
	const rewards = validateRewards(plan.rewards);
	if (!rewards.ok) return rewards;

	return {
		ok: true,
		value: {
			rewards: rewards.value,
			board: plan.layout.map((id) =>
				id === null
					? null
					: { habitId: id, target: targets.get(id)!, habit: kept.has(id) ? null : active.get(id)! }
			)
		}
	};
}

function snapshot(habit: Habit, target: number) {
	return {
		habitId: habit.id,
		icon: habit.icon,
		name: habit.name,
		category: habit.category,
		direction: habit.direction,
		period: habit.period,
		countMode: habit.countMode,
		target,
		isPrivate: habit.isPrivate
	};
}

export async function startCard(
	db: Db,
	user: { id: string; timezone: string; weekStartsOn: WeekStart },
	plan: CardPlan,
	now: Date
): Promise<{ ok: true; card: Card } | CardError> {
	const today = localDate(now, user.timezone);
	const current = monthOf(today);
	const month = plan.month ?? current;
	const early = month !== current;
	if (early && (month !== nextMonth(current) || !canBuildNextMonth(today))) {
		return { ok: false, field: 'month', message: "Next month's card isn't open yet." };
	}
	// Next month's card starts on the 1st (so nothing is prorated) and stays editable through the 2nd.
	const startDate = early ? `${month}-01` : today;
	const resolved = await resolvePlan(db, user.id, plan.size, plan, startDate);
	if (!resolved.ok) return resolved;

	const editableUntil = early
		? startOfLocalDay(`${month}-03`, user.timezone)
		: new Date(
				Math.min(
					now.getTime() + EDIT_WINDOW_MS,
					startOfLocalDay(`${nextMonth(month)}-01`, user.timezone).getTime()
				)
			);
	const cardId = crypto.randomUUID();
	const exists: CardError = {
		ok: false,
		field: 'exists',
		message: `You already have a card for ${monthName(month)}.`
	};
	try {
		const created = await db.transaction(async (tx) => {
			// Starts by the same person queue up here, so the later one finds the card instead of
			// failing on the unique index (which stays as the backstop).
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'card:' + user.id}))`);
			const [already] = await tx
				.select({ id: card.id })
				.from(card)
				.where(and(eq(card.userId, user.id), eq(card.month, month)));
			if (already) return false;
			await tx.insert(card).values({
				id: cardId,
				userId: user.id,
				month,
				size: plan.size,
				startDate,
				editableUntil,
				weekStartsOn: user.weekStartsOn,
				rewardBingo: resolved.value.rewards.bingo,
				rewardSixty: resolved.value.rewards.sixty,
				rewardBlackout: resolved.value.rewards.blackout
			});
			await tx.insert(cardSquare).values(
				resolved.value.board.map((entry, position) => ({
					id: crypto.randomUUID(),
					cardId,
					position,
					isCenter: entry === null,
					...(entry ? snapshot(entry.habit!, entry.target) : {})
				}))
			);
			await postCardStarted(tx, { id: cardId, userId: user.id, month });
			return true;
		});
		if (!created) return exists;
	} catch (error) {
		if (isUniqueViolation(error)) return exists;
		throw error;
	}
	return { ok: true, card: (await getCard(db, user.id, month))! };
}

export async function updateCard(
	db: Db,
	user: { id: string; timezone: string },
	cardId: string,
	plan: Omit<CardPlan, 'size'>,
	now: Date
): Promise<{ ok: true; card: Card } | CardError> {
	// Reading and writing under one per-person lock keeps simultaneous updates from interleaving.
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'card:' + user.id}))`);
		// By id, not by the current month: a window cut at month end closes in the next month.
		const existing = await getCardById(tx, user.id, cardId);
		if (!existing) {
			return {
				ok: false as const,
				field: 'exists' as const,
				message: "There's no card to change."
			};
		}
		if (!isEditable(existing, now)) {
			return { ok: false as const, field: 'locked' as const, message: 'This card is locked.' };
		}
		const kept = new Map<string, KeptSquare>();
		for (const square of existing.squares) {
			if (!square.isCenter && square.habitId) kept.set(square.habitId, square);
		}
		const resolved = await resolvePlan(tx, user.id, existing.size, plan, existing.startDate, kept);
		if (!resolved.ok) return resolved;

		const planned = new Set(plan.habitIds);
		const dropped = existing.squares.filter(
			(s) => !s.isCenter && (s.habitId === null || !planned.has(s.habitId))
		);
		await tx
			.update(card)
			.set({
				rewardBingo: resolved.value.rewards.bingo,
				rewardSixty: resolved.value.rewards.sixty,
				rewardBlackout: resolved.value.rewards.blackout,
				updatedAt: new Date()
			})
			.where(eq(card.id, existing.id));
		if (dropped.length > 0) {
			await tx.delete(cardSquare).where(
				inArray(
					cardSquare.id,
					dropped.map((s) => s.id)
				)
			);
			// A new habit never inherits the old one's highlight or check-in items.
			await tx.delete(feedEvent).where(
				and(
					eq(feedEvent.cardId, existing.id),
					or(
						inArray(
							feedEvent.key,
							dropped.map((s) => `square:${s.id}`)
						),
						...dropped.map((s) => like(feedEvent.key, `checkin:${s.id}:%`))
					)
				)
			);
		}
		// Park the surviving squares off the board so moving them can't hit the unique position.
		for (const square of existing.squares) {
			if (dropped.includes(square) || square.isCenter) continue;
			await tx
				.update(cardSquare)
				.set({ position: -1 - square.position })
				.where(eq(cardSquare.id, square.id));
		}
		for (const [position, entry] of resolved.value.board.entries()) {
			if (entry === null) continue;
			const keptSquare = kept.get(entry.habitId);
			if (keptSquare) {
				await tx
					.update(cardSquare)
					.set({ position, target: entry.target })
					.where(eq(cardSquare.id, keptSquare.id));
			} else {
				await tx.insert(cardSquare).values({
					id: crypto.randomUUID(),
					cardId: existing.id,
					position,
					isCenter: false,
					...snapshot(entry.habit!, entry.target)
				});
			}
		}
		// An edit can make a posted highlight false; clear what is no longer true (it never posts).
		const current = await highlightState(tx, existing.id, localDate(now, user.timezone));
		await syncHighlights(
			tx,
			{ id: existing.id, userId: user.id, size: existing.size },
			current.squares,
			highlightChanges(current.state, current.state)
		);
		return { ok: true as const, card: (await getCardById(tx, user.id, existing.id))! };
	});
}
