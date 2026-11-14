// The habit library: every query is scoped to the signed-in user, so another person's habit is
// indistinguishable from one that doesn't exist.
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { CATEGORIES, isCategoryId, type CategoryId } from '#lib/game/categories.ts';
import { normalizeRule } from '#lib/game/habit-rules.ts';
import { isPickableIcon, type IconName } from '#lib/game/icons.ts';
import { STARTERS } from '#lib/game/starters.ts';
import type { Habit, HabitInput } from '#lib/game/types.ts';
import type { Db } from '#lib/server/db/client.ts';
import { habit } from '#lib/server/db/schema.ts';

export const MAX_ACTIVE_HABITS = 100;
const CAP_MESSAGE = 'You can have up to 100 habits. Archive some to add more.';

type Problem = { ok: false; field: string; message: string };
export type HabitResult = { ok: true; habit: Habit } | Problem;
type HabitValues = Omit<Habit, 'id' | 'archivedAt'>;

export function validateHabitInput(input: HabitInput): { ok: true; value: HabitValues } | Problem {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 40) {
		return { ok: false, field: 'name', message: 'Give it a name (up to 40 characters).' };
	}
	const icon = input.icon;
	if (!isPickableIcon(icon)) return { ok: false, field: 'icon', message: 'Pick an icon.' };
	if (!isCategoryId(input.category)) {
		return { ok: false, field: 'category', message: 'Pick a category.' };
	}
	const rule = normalizeRule(input);
	if (!rule.ok) return rule;
	return {
		ok: true,
		value: { icon, name, category: input.category, isPrivate: input.isPrivate, ...rule.rule }
	};
}

type Row = typeof habit.$inferSelect;

function toHabit(row: Row): Habit {
	return {
		id: row.id,
		icon: row.icon as IconName,
		name: row.name,
		category: row.category as CategoryId,
		direction: row.direction as Habit['direction'],
		period: row.period as Habit['period'],
		countMode: row.countMode as Habit['countMode'],
		target: row.target,
		isPrivate: row.isPrivate,
		archivedAt: row.archivedAt
	};
}

const CATEGORY_ORDER = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));

export async function listHabits(
	db: Db,
	userId: string,
	options: { archived?: boolean; category?: CategoryId } = {}
): Promise<Habit[]> {
	const rows = await db
		.select()
		.from(habit)
		.where(
			and(
				eq(habit.userId, userId),
				options.archived ? isNotNull(habit.archivedAt) : isNull(habit.archivedAt),
				options.category ? eq(habit.category, options.category) : undefined
			)
		);
	return rows
		.map(toHabit)
		.sort(
			(a, b) =>
				(CATEGORY_ORDER.get(a.category) ?? 0) - (CATEGORY_ORDER.get(b.category) ?? 0) ||
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
}

export async function getHabit(db: Db, userId: string, habitId: string): Promise<Habit | null> {
	const [row] = await db
		.select()
		.from(habit)
		.where(and(eq(habit.id, habitId), eq(habit.userId, userId)));
	return row ? toHabit(row) : null;
}

async function activeCount(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(habit)
		.where(and(eq(habit.userId, userId), isNull(habit.archivedAt)));
	return row.n;
}

export async function createHabit(db: Db, userId: string, input: HabitInput): Promise<HabitResult> {
	const valid = validateHabitInput(input);
	if (!valid.ok) return valid;
	if ((await activeCount(db, userId)) >= MAX_ACTIVE_HABITS) {
		return { ok: false, field: 'form', message: CAP_MESSAGE };
	}
	const [row] = await db
		.insert(habit)
		.values({ id: crypto.randomUUID(), userId, ...valid.value })
		.returning();
	return { ok: true, habit: toHabit(row) };
}

/** Null when the habit doesn't exist or isn't the user's. */
export async function updateHabit(
	db: Db,
	userId: string,
	habitId: string,
	input: HabitInput
): Promise<HabitResult | null> {
	if (!(await getHabit(db, userId, habitId))) return null;
	const valid = validateHabitInput(input);
	if (!valid.ok) return valid;
	const [row] = await db
		.update(habit)
		.set({ ...valid.value, updatedAt: sql`now()` })
		.where(and(eq(habit.id, habitId), eq(habit.userId, userId)))
		.returning();
	return { ok: true, habit: toHabit(row) };
}

/** Idempotent: an already archived habit keeps its original archive date. */
export async function archiveHabit(
	db: Db,
	userId: string,
	habitId: string,
	now: Date
): Promise<boolean> {
	const found = await getHabit(db, userId, habitId);
	if (!found) return false;
	if (found.archivedAt === null) {
		await db
			.update(habit)
			.set({ archivedAt: now })
			.where(and(eq(habit.id, habitId), eq(habit.userId, userId)));
	}
	return true;
}

/** Idempotent; `'full'` when restoring would go past the active-habit cap. */
export async function restoreHabit(
	db: Db,
	userId: string,
	habitId: string
): Promise<boolean | 'full'> {
	const found = await getHabit(db, userId, habitId);
	if (!found) return false;
	if (found.archivedAt === null) return true;
	if ((await activeCount(db, userId)) >= MAX_ACTIVE_HABITS) return 'full';
	await db
		.update(habit)
		.set({ archivedAt: null })
		.where(and(eq(habit.id, habitId), eq(habit.userId, userId)));
	return true;
}

/**
 * Deletes an archived habit forever. Cards keep their own copy of it (their squares' `habit_id` is
 * cleared, the snapshot stays). False when it isn't the person's; 'active' when it isn't archived.
 */
export async function deleteHabit(
	db: Db,
	userId: string,
	habitId: string
): Promise<boolean | 'active'> {
	const found = await getHabit(db, userId, habitId);
	if (!found) return false;
	if (found.archivedAt === null) return 'active';
	await db.delete(habit).where(and(eq(habit.id, habitId), eq(habit.userId, userId)));
	return true;
}

const sameName = (a: string, b: string) =>
	a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** Ids of starters whose names already match one of these (active) habits. */
export function addedStarterIds(habits: readonly Habit[]): string[] {
	return STARTERS.filter((starter) => habits.some((h) => sameName(h.name, starter.name))).map(
		(starter) => starter.id
	);
}

/**
 * Adds a suggestion to the library unless an active habit already has its name. Runs under a
 * per-user lock so a double tap can't insert it twice.
 */
export async function addStarter(
	db: Db,
	userId: string,
	starterId: string
): Promise<{ ok: true; added: boolean } | { ok: false; message: string }> {
	const starter = STARTERS.find((s) => s.id === starterId);
	if (!starter) return { ok: false, message: 'Unknown suggestion.' };
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'starter:' + userId}))`);
		const active = await tx
			.select({ name: habit.name })
			.from(habit)
			.where(and(eq(habit.userId, userId), isNull(habit.archivedAt)));
		if (active.some((row) => sameName(row.name, starter.name))) return { ok: true, added: false };
		if (active.length >= MAX_ACTIVE_HABITS) return { ok: false, message: CAP_MESSAGE };
		await tx.insert(habit).values({
			id: crypto.randomUUID(),
			userId,
			icon: starter.icon,
			name: starter.name,
			category: starter.category,
			isPrivate: false,
			...starter.rule
		});
		return { ok: true, added: true };
	});
}
