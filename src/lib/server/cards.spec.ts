import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_SIZES, type CardSize } from '#lib/game/card-layout.ts';
import type { Db } from '#lib/server/db/client.ts';
import { card, cardSquare, feedEvent, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import {
	currentMonth,
	getCard,
	isEditable,
	startCard,
	editBlocked,
	updateCard,
	validateRewards,
	type CardPlan
} from './cards';
import type { Rewards } from '#lib/game/types.ts';
import { archiveHabit, createHabit, updateHabit, type Habit } from './habits';

let db: Db;

type TestUser = { id: string; timezone: string; weekStartsOn: 'monday' | 'sunday' };

async function makeUser(
	timezone = 'UTC',
	weekStartsOn: 'monday' | 'sunday' = 'monday'
): Promise<TestUser> {
	const id = crypto.randomUUID();
	await db.insert(user).values({
		id,
		name: 'Someone',
		email: `${id}@users.invalid`,
		username: `u_${id.slice(0, 8)}`,
		displayUsername: `u_${id.slice(0, 8)}`,
		timezone,
		weekStartsOn
	});
	return { id, timezone, weekStartsOn };
}

async function makeHabit(userId: string, name: string, overrides: Record<string, unknown> = {}) {
	const result = await createHabit(db, userId, {
		icon: 'bicycle',
		name,
		category: 'fitness',
		direction: 'atLeast',
		period: 'week',
		countMode: 'days',
		target: 3,
		isPrivate: false,
		...overrides
	});
	if (!result.ok) throw new Error(result.message);
	return result.habit;
}

async function makeHabits(userId: string, n: number): Promise<Habit[]> {
	const habits: Habit[] = [];
	for (let i = 0; i < n; i++) habits.push(await makeHabit(userId, `Habit ${i}`));
	return habits;
}

const rewards: Rewards = { bingo: 'Pizza', sixty: 'Movie night', blackout: 'Weekend away' };

function plan(habits: Habit[], size: CardSize = 3, extra: Partial<CardPlan> = {}): CardPlan {
	const ids = habits.map((h) => h.id);
	const layout: (string | null)[] = [...ids];
	layout.splice(CARD_SIZES[size].centerPosition, 0, null);
	return { size, habitIds: ids, targets: {}, rewards, layout, ...extra };
}

function withoutSize(p: CardPlan): Omit<CardPlan, 'size'> {
	return { habitIds: p.habitIds, targets: p.targets, rewards: p.rewards, layout: p.layout };
}

const OCT_19 = new Date('2026-10-19T09:00:00Z');

async function started(u: TestUser, habits: Habit[], now = OCT_19, size: CardSize = 3) {
	const result = await startCard(db, u, plan(habits, size), now);
	if (!result.ok) throw new Error(result.message);
	return result.card;
}

beforeEach(async () => {
	db = await createTestDb();
});

describe('validateRewards', () => {
	it('trims and accepts 1 to 80 characters', () => {
		const result = validateRewards({ bingo: '  Pizza ', sixty: 'a', blackout: 'b'.repeat(80) });
		expect(result).toEqual({
			ok: true,
			value: { bingo: 'Pizza', sixty: 'a', blackout: 'b'.repeat(80) }
		});
	});
});

describe('currentMonth', () => {
	it("is the month in the person's time zone", () => {
		const now = new Date('2026-10-31T11:30:00Z');
		expect(currentMonth({ timezone: 'Pacific/Kiritimati' }, now)).toBe('2026-11');
		expect(currentMonth({ timezone: 'UTC' }, now)).toBe('2026-10');
	});
});

describe('card_square columns', () => {
	it('the center flag is is_center (renamed from is_free)', async () => {
		const result = (await db.execute(
			sql`select column_name from information_schema.columns where table_name = 'card_square' and column_name in ('is_center', 'is_free')`
		)) as unknown as { rows: { column_name: string }[] };
		expect(result.rows.map((row) => row.column_name)).toEqual(['is_center']);
	});
});

describe('startCard', () => {
	it('starts a 3×3 card: snapshots habits, prorates month targets, keeps overrides', async () => {
		const me = await makeUser();
		const read = await makeHabit(me.id, 'Read', { period: 'month', countMode: 'days', target: 10 });
		const others = await makeHabits(me.id, 7);
		const walk = others[0];
		const result = await startCard(
			db,
			me,
			plan([read, ...others], 3, { targets: { [walk.id]: 5 } }),
			OCT_19
		);
		if (!result.ok) throw new Error(result.message);
		const { card: built } = result;
		expect(built.month).toBe('2026-10');
		expect(built.size).toBe(3);
		expect(built.rewards).toEqual(rewards);
		expect(built.squares).toHaveLength(9);
		expect(built.squares.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
		expect(built.squares[4]).toMatchObject({ position: 4, isCenter: true });
		expect(built.squares.filter((s) => !s.isCenter)).toHaveLength(8);
		const readSquare = built.squares.find((s) => !s.isCenter && s.habitId === read.id);
		expect(readSquare).toMatchObject({
			icon: 'bicycle',
			name: 'Read',
			category: 'fitness',
			direction: 'atLeast',
			period: 'month',
			countMode: 'days',
			target: 4,
			isPrivate: false
		});
		const walkSquare = built.squares.find((s) => !s.isCenter && s.habitId === walk.id);
		expect(walkSquare).toMatchObject({ target: 5 });
		expect(await getCard(db, me.id, '2026-10')).toEqual(built);
	});

	it("snapshots each habit's icon onto its square; the center has none", async () => {
		const me = await makeUser();
		const water = await makeHabit(me.id, 'Water', { icon: 'drop' });
		const others = await makeHabits(me.id, 7);
		const result = await startCard(db, me, plan([water, ...others], 3), OCT_19);
		if (!result.ok) throw new Error(result.message);
		const squares = result.card.squares;
		expect(squares.find((s) => !s.isCenter && s.habitId === water.id)).toMatchObject({
			icon: 'drop'
		});
		expect(squares[4]).not.toHaveProperty('icon');
		const rows = await db.select().from(cardSquare).where(eq(cardSquare.cardId, result.card.id));
		expect(rows.find((r) => r.isCenter)!.icon).toBeNull();
		expect(rows.find((r) => r.habitId === water.id)!.icon).toBe('drop');
	});

	it('5×5 has a FREE square at position 12 and 24 habit squares', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 24);
		const result = await startCard(db, me, plan(habits, 5), OCT_19);
		if (!result.ok) throw new Error(result.message);
		const { squares } = result.card;
		expect(squares).toHaveLength(25);
		expect(squares[12]).toMatchObject({ position: 12, isCenter: true });
		expect(squares.filter((s) => !s.isCenter)).toHaveLength(24);
	});

	it("uses the person's month, start date and week start", async () => {
		const me = await makeUser('Pacific/Kiritimati', 'sunday');
		const habits = await makeHabits(me.id, 8);
		const result = await startCard(db, me, plan(habits), new Date('2026-10-31T11:30:00Z'));
		if (!result.ok) throw new Error(result.message);
		expect(result.card).toMatchObject({
			month: '2026-11',
			startDate: '2026-11-01',
			weekStartsOn: 'sunday'
		});
	});

	it('editable for 48 hours, cut at the end of the month', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const mid = await started(me, habits, new Date('2026-10-10T12:00:00Z'));
		expect(mid.editableUntil.toISOString()).toBe('2026-10-12T12:00:00.000Z');

		const late = await makeUser('UTC');
		const lateHabits = await makeHabits(late.id, 8);
		const end = await started(late, lateHabits, new Date('2026-10-31T20:00:00Z'));
		expect(end.editableUntil.toISOString()).toBe('2026-11-01T00:00:00.000Z');
	});

	it('refuses a second card for the month', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		await started(me, habits);
		const again = await startCard(db, me, plan(habits), OCT_19);
		expect(again).toMatchObject({
			ok: false,
			field: 'exists',
			message: 'You already have a card for October.'
		});
		expect(await db.select().from(card)).toHaveLength(1);
	});

	it('lets only one of two simultaneous starts win', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const results = await Promise.all([
			startCard(db, me, plan(habits), OCT_19),
			startCard(db, me, plan(habits), OCT_19)
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok)).toMatchObject([{ field: 'exists' }]);
		expect(await db.select().from(card)).toHaveLength(1);
		expect(await db.select().from(cardSquare)).toHaveLength(9);
	});

	it('refuses habits that are not mine, archived, duplicated or the wrong count', async () => {
		const me = await makeUser();
		const other = await makeUser();
		const habits = await makeHabits(me.id, 10);
		const theirs = await makeHabit(other.id, 'Theirs');
		const eight = habits.slice(0, 8);
		const expectHabits = async (p: CardPlan) =>
			expect(await startCard(db, me, p, OCT_19)).toMatchObject({
				ok: false,
				field: 'habits',
				message: 'Pick from your habits.'
			});

		await expectHabits(plan([...eight.slice(0, 7), theirs]));
		await expectHabits(plan(habits.slice(0, 7)));
		await expectHabits(plan(habits.slice(0, 9)));
		await expectHabits(plan([...eight.slice(0, 7), eight[0]]));
		await archiveHabit(db, me.id, eight[7].id, OCT_19);
		await expectHabits(plan(eight));
		expect(await db.select().from(card)).toHaveLength(0);
	});

	it('refuses an out-of-range override and a bad layout', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		expect(
			await startCard(db, me, plan(habits, 3, { targets: { [habits[2].id]: 8 } }), OCT_19)
		).toEqual({
			ok: false,
			field: 'targets',
			message: 'Pick a number from 1 to 7 for Habit 2.'
		});
		const broken = plan(habits);
		broken.layout[0] = broken.layout[1];
		expect(await startCard(db, me, broken, OCT_19)).toEqual({
			ok: false,
			field: 'layout',
			message: 'Shuffle the board again.'
		});
	});

	it('refuses empty or 81-character rewards', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		expect(
			await startCard(db, me, plan(habits, 3, { rewards: { ...rewards, sixty: '   ' } }), OCT_19)
		).toEqual({ ok: false, field: 'sixty', message: 'Write a reward (up to 80 characters).' });
		expect(
			await startCard(
				db,
				me,
				plan(habits, 3, { rewards: { ...rewards, blackout: 'x'.repeat(81) } }),
				OCT_19
			)
		).toMatchObject({ ok: false, field: 'blackout' });
	});

	it('later library edits never change the card', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const before = await started(me, habits);
		await updateHabit(db, me.id, habits[0].id, {
			icon: 'carrot',
			name: 'Renamed',
			category: 'health',
			direction: 'atMost',
			period: 'day',
			target: 2,
			isPrivate: true
		});
		await archiveHabit(db, me.id, habits[1].id, OCT_19);
		expect(await getCard(db, me.id, '2026-10')).toEqual(before);
	});
});

describe('isEditable', () => {
	it('is true strictly before editableUntil', () => {
		const editableUntil = new Date('2026-10-21T09:00:00Z');
		expect(isEditable({ editableUntil }, new Date('2026-10-21T08:59:59Z'))).toBe(true);
		expect(isEditable({ editableUntil }, editableUntil)).toBe(false);
	});
});

describe('editBlocked', () => {
	const editableUntil = new Date('2026-10-21T09:00:00Z');
	const open = new Date('2026-10-21T08:59:59Z');
	const card = { id: 'c1', editableUntil };

	it('never blocks a draft that is not editing a card', () => {
		expect(editBlocked(null, null, editableUntil)).toBe(false);
		expect(editBlocked(null, card, editableUntil)).toBe(false);
	});

	it('blocks an edit draft once the window has closed', () => {
		expect(editBlocked('c1', card, open)).toBe(false);
		expect(editBlocked('c1', card, editableUntil)).toBe(true);
	});

	it('blocks an edit draft whose card is missing or a different one', () => {
		expect(editBlocked('c1', null, open)).toBe(true);
		expect(editBlocked('c2', card, open)).toBe(true);
	});
});

describe('startCard for next month', () => {
	const OCT_26 = new Date('2026-10-26T12:00:00Z');

	it("starts next month's card in the last 7 days", async () => {
		const me = await makeUser();
		const read = await makeHabit(me.id, 'Read', { period: 'month', countMode: 'days', target: 10 });
		const others = await makeHabits(me.id, 7);
		const result = await startCard(
			db,
			me,
			{ ...plan([read, ...others]), month: '2026-11' },
			OCT_26
		);
		if (!result.ok) throw new Error(result.message);
		expect(result.card.month).toBe('2026-11');
		expect(result.card.startDate).toBe('2026-11-01');
		// Starts on the 1st: the full target, no proration.
		const square = result.card.squares.find((s) => !s.isCenter && s.habitId === read.id);
		expect(square).toMatchObject({ target: 10 });
		// Editable until the end of November 2.
		expect(result.card.editableUntil.toISOString()).toBe('2026-11-03T00:00:00.000Z');
		// This month's card is a separate card.
		expect(await getCard(db, me.id, '2026-10')).toBeNull();
	});

	it('refuses next month before the window', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		expect(
			await startCard(
				db,
				me,
				{ ...plan(habits), month: '2026-11' },
				new Date('2026-10-24T12:00:00Z')
			)
		).toEqual({ ok: false, field: 'month', message: "Next month's card isn't open yet." });
		expect(await startCard(db, me, { ...plan(habits), month: '2026-12' }, OCT_26)).toMatchObject({
			ok: false,
			field: 'month'
		});
		expect(await db.select().from(card)).toHaveLength(0);
	});

	it("opens the window by the person's own date", async () => {
		const at = new Date('2026-10-24T11:00:00Z');
		const kiritimati = await makeUser('Pacific/Kiritimati');
		const pagoPago = await makeUser('Pacific/Pago_Pago');
		const ok = await startCard(
			db,
			kiritimati,
			{ ...plan(await makeHabits(kiritimati.id, 8)), month: '2026-11' },
			at
		);
		expect(ok).toMatchObject({ ok: true });
		if (ok.ok) expect(ok.card.editableUntil.toISOString()).toBe('2026-11-02T10:00:00.000Z');
		expect(
			await startCard(
				db,
				pagoPago,
				{ ...plan(await makeHabits(pagoPago.id, 8)), month: '2026-11' },
				at
			)
		).toMatchObject({ ok: false, field: 'month' });
	});

	it("next month's card is editable until the end of the 2nd", async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 9);
		const started = await startCard(
			db,
			me,
			{ ...plan(habits.slice(0, 8)), month: '2026-11' },
			OCT_26
		);
		if (!started.ok) throw new Error(started.message);
		const swap = withoutSize(plan([...habits.slice(0, 7), habits[8]]));
		expect(
			await updateCard(db, me, started.card.id, swap, new Date('2026-11-02T23:59:00Z'))
		).toMatchObject({ ok: true });
		expect(
			await updateCard(db, me, started.card.id, swap, new Date('2026-11-03T00:00:00Z'))
		).toMatchObject({ ok: false, field: 'locked' });
	});
});

describe('updateCard', () => {
	it('updates within the window, keeping square ids for habits that stay', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const extra = await makeHabit(me.id, 'Extra', { icon: 'book-open', category: 'mind' });
		const before = await started(me, habits);
		const swapped = [...habits.slice(0, 7), extra];
		const layout = plan(swapped).layout.slice().reverse();
		const result = await updateCard(
			db,
			me,
			before.id,
			{
				habitIds: swapped.map((h) => h.id),
				targets: { [habits[0].id]: 6 },
				rewards: { ...rewards, bingo: 'Sushi' },
				layout
			},
			new Date('2026-10-19T10:00:00Z')
		);
		if (!result.ok) throw new Error(result.message);
		const after = result.card;
		expect(after.id).toBe(before.id);
		expect(after.rewards.bingo).toBe('Sushi');
		expect(after.editableUntil).toEqual(before.editableUntil);
		expect(after.squares.map((s) => (s.isCenter ? null : s.habitId))).toEqual(layout);
		const keptBefore = before.squares.find((s) => !s.isCenter && s.habitId === habits[0].id)!;
		const keptAfter = after.squares.find((s) => !s.isCenter && s.habitId === habits[0].id)!;
		expect(keptAfter.id).toBe(keptBefore.id);
		expect(keptAfter).toMatchObject({ target: 6, name: 'Habit 0' });
		const droppedId = before.squares.find((s) => !s.isCenter && s.habitId === habits[7].id)!.id;
		expect(after.squares.some((s) => s.id === droppedId)).toBe(false);
		expect(after.squares.find((s) => !s.isCenter && s.habitId === extra.id)).toMatchObject({
			name: 'Extra',
			icon: 'book-open'
		});
		expect(await db.select().from(cardSquare)).toHaveLength(9);
	});

	it('keeps the snapshot rule of a kept habit after the library changes it', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const before = await started(me, habits);
		await updateHabit(db, me.id, habits[0].id, {
			icon: 'carrot',
			name: 'Renamed',
			category: 'health',
			direction: 'atLeast',
			period: 'day',
			target: 1,
			isPrivate: false
		});
		const keep = withoutSize(plan(habits));
		const same = await updateCard(db, me, before.id, keep, OCT_19);
		if (!same.ok) throw new Error(same.message);
		expect(same.card.squares).toEqual(before.squares);

		// 6 is valid for the snapshot (3 days a week, up to 7), not for the edited library habit.
		const override = await updateCard(
			db,
			me,
			before.id,
			{ ...keep, targets: { [habits[0].id]: 6 } },
			OCT_19
		);
		if (!override.ok) throw new Error(override.message);
		expect(override.card.squares[0]).toMatchObject({
			period: 'week',
			countMode: 'days',
			target: 6,
			name: 'Habit 0'
		});
		const tooHigh = await updateCard(
			db,
			me,
			before.id,
			{ ...keep, targets: { [habits[0].id]: 8 } },
			OCT_19
		);
		expect(tooHigh).toEqual({
			ok: false,
			field: 'targets',
			message: 'Pick a number from 1 to 7 for Habit 0.'
		});
	});

	it('lets an archived habit stay on the card but not be newly added', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 10);
		const before = await started(me, habits.slice(0, 8));
		await archiveHabit(db, me.id, habits[0].id, OCT_19);
		const keep = withoutSize(plan(habits.slice(0, 8)));
		const kept = await updateCard(
			db,
			me,
			before.id,
			{ ...keep, rewards: { ...rewards, bingo: 'Tacos' } },
			OCT_19
		);
		if (!kept.ok) throw new Error(kept.message);
		expect(kept.card.rewards.bingo).toBe('Tacos');
		expect(kept.card.squares).toEqual(before.squares);

		await archiveHabit(db, me.id, habits[9].id, OCT_19);
		const added = withoutSize(plan([...habits.slice(1, 9), habits[9]]));
		expect(await updateCard(db, me, before.id, added, OCT_19)).toMatchObject({
			ok: false,
			field: 'habits'
		});
	});

	it('serialises simultaneous updates', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const existing = await started(me, habits);
		const a = withoutSize(plan(habits));
		const b = { ...a, layout: [...a.layout].reverse() };
		const results = await Promise.all([
			updateCard(db, me, existing.id, a, OCT_19),
			updateCard(db, me, existing.id, b, OCT_19)
		]);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(await db.select().from(cardSquare)).toHaveLength(9);
	});

	it('refuses updates after the window', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const before = await started(me, habits);
		expect(
			await updateCard(db, me, before.id, withoutSize(plan(habits)), before.editableUntil)
		).toEqual({ ok: false, field: 'locked', message: 'This card is locked.' });
	});

	it.each([
		['UTC', '2026-10-31T20:00:00Z', '2026-11-01T00:00:05Z'],
		['Pacific/Kiritimati', '2026-10-31T09:00:00Z', '2026-10-31T10:00:05Z'],
		['Pacific/Pago_Pago', '2026-11-01T08:00:00Z', '2026-11-01T11:00:05Z']
	])('says locked, not missing, once the month has ended (%s)', async (timezone, start, save) => {
		const me = await makeUser(timezone);
		const habits = await makeHabits(me.id, 8);
		const before = await started(me, habits, new Date(start));
		// The window was cut at the end of the local month, so it closes before 48 hours pass.
		expect(before.editableUntil.getTime() - new Date(start).getTime()).toBeLessThan(48 * 3_600_000);
		const now = new Date(save);
		expect(currentMonth(me, now)).not.toBe(before.month);
		expect(await updateCard(db, me, before.id, withoutSize(plan(habits)), now)).toEqual({
			ok: false,
			field: 'locked',
			message: 'This card is locked.'
		});
	});

	it("treats another user's card id as not found", async () => {
		const me = await makeUser();
		const other = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const theirs = await started(other, await makeHabits(other.id, 8));
		expect(await updateCard(db, me, theirs.id, withoutSize(plan(habits)), OCT_19)).toMatchObject({
			ok: false,
			field: 'exists'
		});
		expect(
			await updateCard(db, me, crypto.randomUUID(), withoutSize(plan(habits)), OCT_19)
		).toMatchObject({
			ok: false,
			field: 'exists'
		});
	});

	it('says so when there is no card yet', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		expect(
			await updateCard(db, me, crypto.randomUUID(), withoutSize(plan(habits)), OCT_19)
		).toEqual({ ok: false, field: 'exists', message: "There's no card to change." });
	});

	it('validates like startCard', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const existing = await started(me, habits);
		const short = withoutSize(plan(habits.slice(0, 7)));
		expect(await updateCard(db, me, existing.id, short, OCT_19)).toMatchObject({
			ok: false,
			field: 'habits'
		});
	});
});

describe('ownership', () => {
	it("never returns another user's card; deleting a user deletes their cards", async () => {
		const me = await makeUser();
		const other = await makeUser();
		const habits = await makeHabits(me.id, 8);
		await started(me, habits);
		expect(await getCard(db, other.id, '2026-10')).toBeNull();
		expect(await getCard(db, me.id, '2026-09')).toBeNull();
		await db.delete(user).where(eq(user.id, me.id));
		expect(await db.select().from(card)).toHaveLength(0);
		expect(await db.select().from(cardSquare)).toHaveLength(0);
	});
});

describe('feed highlights', () => {
	const keys = async (cardId: string) =>
		(await db.select({ key: feedEvent.key }).from(feedEvent).where(eq(feedEvent.cardId, cardId)))
			.map((e) => e.key)
			.sort();

	it('startCard posts only cardStarted', async () => {
		const me = await makeUser();
		const habits: Habit[] = [];
		for (let i = 0; i < 8; i++) {
			habits.push(
				await makeHabit(me.id, `Limit ${i}`, { direction: 'atMost', countMode: 'times', target: 3 })
			);
		}
		const created = await started(me, habits);
		expect(await keys(created.id)).toEqual(['card']);
	});

	it('swapping a habit removes its square event', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const extra = await makeHabit(me.id, 'Extra', { icon: 'book-open', category: 'mind' });
		const created = await started(me, habits);
		const gone = created.squares.find((s) => !s.isCenter && s.habitId === habits[7].id)!;
		await db.insert(feedEvent).values({
			id: crypto.randomUUID(),
			userId: me.id,
			cardId: created.id,
			type: 'squareComplete',
			key: `square:${gone.id}`,
			payload: {},
			createdAt: new Date()
		});
		await db.insert(feedEvent).values({
			id: crypto.randomUUID(),
			userId: me.id,
			cardId: created.id,
			type: 'checkIn',
			key: `checkin:${gone.id}:2026-10-19`,
			payload: { date: '2026-10-19', count: 1, backfilled: false },
			createdAt: new Date()
		});
		const swapped = [...habits.slice(0, 7), extra];
		const result = await updateCard(db, me, created.id, withoutSize(plan(swapped)), OCT_19);
		expect(result.ok).toBe(true);
		expect(await keys(created.id)).toEqual(['card']);
	});

	it('an edit clears a highlight that is no longer true', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const created = await started(me, habits);
		// A kept square that is not complete must lose a stale highlight, not only swapped squares.
		const kept = created.squares.find((s) => !s.isCenter)!;
		await db.insert(feedEvent).values({
			id: crypto.randomUUID(),
			userId: me.id,
			cardId: created.id,
			type: 'squareComplete',
			key: `square:${kept.id}`,
			payload: {},
			createdAt: new Date()
		});
		const result = await updateCard(db, me, created.id, withoutSize(plan(habits)), OCT_19);
		expect(result.ok).toBe(true);
		expect(await keys(created.id)).toEqual(['card']);
	});
});
