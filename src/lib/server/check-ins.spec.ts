import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { CARD_SIZES, type CardSize } from '#lib/game/card-layout.ts';
import { evaluateSquare } from '#lib/game/evaluate.ts';
import type { Db } from '#lib/server/db/client.ts';
import { checkIn, feedEvent, reaction, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import type { Rewards } from '#lib/game/types.ts';
import { startCard, updateCard, type Card, type CardPlan } from './cards';
import { getCheckIns, logCheckIn, MAX_COUNT, setCheckIn } from './check-ins';
import { createHabit, updateHabit } from './habits';
import type { Habit } from '#lib/game/types.ts';

let db: Db;

type TestUser = { id: string; timezone: string; weekStartsOn: 'monday' | 'sunday' };

async function makeUser(timezone = 'UTC'): Promise<TestUser> {
	const id = crypto.randomUUID();
	await db.insert(user).values({
		id,
		name: 'Someone',
		email: `${id}@users.invalid`,
		username: `u_${id.slice(0, 8)}`,
		displayUsername: `u_${id.slice(0, 8)}`,
		timezone,
		weekStartsOn: 'monday'
	});
	return { id, timezone, weekStartsOn: 'monday' };
}

async function makeHabits(
	userId: string,
	n: number,
	overrides: Record<string, unknown> = {}
): Promise<Habit[]> {
	const habits: Habit[] = [];
	for (let i = 0; i < n; i++) {
		const result = await createHabit(db, userId, {
			icon: 'bicycle',
			name: `Habit ${i}`,
			category: 'fitness',
			direction: 'atLeast',
			period: 'day',
			countMode: 'times',
			target: 1,
			isPrivate: false,
			...overrides
		});
		if (!result.ok) throw new Error(result.message);
		habits.push(result.habit);
	}
	return habits;
}

const rewards: Rewards = { bingo: 'Pizza', sixty: 'Movie night', blackout: 'Weekend away' };

function plan(habits: Habit[], size: CardSize = 3, extra: Partial<CardPlan> = {}): CardPlan {
	const ids = habits.map((h) => h.id);
	const layout: (string | null)[] = [...ids];
	layout.splice(CARD_SIZES[size].centerPosition, 0, null);
	return { size, habitIds: ids, targets: {}, rewards, layout, ...extra };
}

async function cardFor(u: TestUser, habits: Habit[], now: Date): Promise<Card> {
	const result = await startCard(db, u, plan(habits), now);
	if (!result.ok) throw new Error(result.message);
	return result.card;
}

const habitSquare = (card: Card, index = 0) => card.squares.filter((s) => !s.isCenter)[index];
const OCT_1 = new Date('2026-10-01T09:00:00Z');
const OCT_20 = new Date('2026-10-20T09:00:00Z'); // the window is Oct 17–20

beforeEach(async () => {
	db = await createTestDb();
});

describe('logCheckIn', () => {
	it('adds one per tap and removes at zero', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		const log = (delta: 1 | -1) => logCheckIn(db, me, id, '2026-10-20', delta, OCT_20);
		expect(await log(1)).toEqual({ ok: true, count: 1 });
		expect(await log(1)).toEqual({ ok: true, count: 2 });
		expect(await log(-1)).toEqual({ ok: true, count: 1 });
		expect(await log(-1)).toEqual({ ok: true, count: 0 });
		expect(await db.select().from(checkIn)).toHaveLength(0);
		expect(await log(-1)).toEqual({ ok: true, count: 0 });
	});

	it('stops at 20', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		expect(MAX_COUNT).toBe(20);
		for (let i = 0; i < 21; i++) await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20);
		expect(await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20)).toEqual({ ok: true, count: 20 });
	});

	it('counts every simultaneous tap', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		await Promise.all(
			Array.from({ length: 5 }, () => logCheckIn(db, me, id, '2026-10-20', 1, OCT_20))
		);
		expect((await getCheckIns(db, card.id)).get(id)?.get('2026-10-20')).toBe(5);
	});

	it('counts every simultaneous undo', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20);
		await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20);
		const results = await Promise.all([
			logCheckIn(db, me, id, '2026-10-20', -1, OCT_20),
			logCheckIn(db, me, id, '2026-10-20', -1, OCT_20)
		]);
		expect(results.every((r) => r?.ok)).toBe(true);
		expect(await db.select().from(checkIn)).toHaveLength(0);
	});

	it('refuses dates outside the window or the span', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), new Date('2026-10-19T09:00:00Z'));
		const { id } = habitSquare(card);
		const refused = {
			ok: false,
			field: 'date',
			message: "You can log any day of this card's month, up to today."
		};
		for (const date of ['2026-10-16', '2026-10-18', '2026-10-21', 'not-a-date']) {
			expect(await logCheckIn(db, me, id, date, 1, OCT_20)).toEqual(refused);
		}
		expect(await db.select().from(checkIn)).toHaveLength(0);
	});

	it('logs a day 12 days ago, but not tomorrow', async () => {
		const me = await makeUser();
		const { id } = habitSquare(await cardFor(me, await makeHabits(me.id, 8), OCT_1));
		expect(await logCheckIn(db, me, id, '2026-10-08', 1, OCT_20)).toEqual({ ok: true, count: 1 });
		expect(await logCheckIn(db, me, id, '2026-10-21', 1, OCT_20)).toMatchObject({
			ok: false,
			field: 'date',
			message: "You can log any day of this card's month, up to today."
		});
	});

	it("another person's square, the center square or last month's card is not found", async () => {
		const me = await makeUser();
		const other = await makeUser();
		const mine = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const theirs = await cardFor(other, await makeHabits(other.id, 8), OCT_1);
		const center = mine.squares.find((s) => s.isCenter)!;
		const september = await cardFor(
			me,
			await makeHabits(me.id, 8),
			new Date('2026-09-10T09:00:00Z')
		);
		for (const id of [habitSquare(theirs).id, center.id, habitSquare(september).id, 'nope']) {
			expect(await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20)).toBeNull();
		}
	});

	it("logs last month's last days on the 1st–3rd, then locks them (spec §3.8)", async () => {
		const me = await makeUser();
		const { id } = habitSquare(await cardFor(me, await makeHabits(me.id, 8), OCT_1));
		const NOV_1 = new Date('2026-11-01T09:00:00Z');
		expect(await logCheckIn(db, me, id, '2026-10-29', 1, NOV_1)).toEqual({ ok: true, count: 1 });
		expect(await logCheckIn(db, me, id, '2026-11-01', 1, NOV_1)).toMatchObject({ ok: false });
		const NOV_3 = new Date('2026-11-03T09:00:00Z');
		expect(await logCheckIn(db, me, id, '2026-10-31', 1, NOV_3)).toEqual({ ok: true, count: 1 });
		expect(await logCheckIn(db, me, id, '2026-10-30', 1, NOV_3)).toEqual({ ok: true, count: 1 });
		const NOV_4 = new Date('2026-11-04T09:00:00Z');
		expect(await logCheckIn(db, me, id, '2026-10-31', 1, NOV_4)).toBeNull();
	});

	it("uses the person's own today", async () => {
		const me = await makeUser('Pacific/Kiritimati');
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		// 2026-11-03T11:30Z is already November 4 in Kiritimati: October is closed.
		const at = new Date('2026-11-03T11:30:00Z');
		expect(await logCheckIn(db, me, habitSquare(card).id, '2026-10-31', 1, at)).toBeNull();
	});
});

describe('setCheckIn', () => {
	it('sets, clamps and deletes at zero', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		expect(await setCheckIn(db, me, id, '2026-10-20', 3, OCT_20)).toEqual({ ok: true, count: 3 });
		expect(await setCheckIn(db, me, id, '2026-10-20', 99, OCT_20)).toEqual({ ok: true, count: 20 });
		expect(await setCheckIn(db, me, id, '2026-10-20', 0, OCT_20)).toEqual({ ok: true, count: 0 });
		expect(await db.select().from(checkIn)).toHaveLength(0);
	});

	it('refuses a count that is not a number', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		expect(await setCheckIn(db, me, id, '2026-10-20', NaN, OCT_20)).toEqual({
			ok: false,
			field: 'count',
			message: 'Pick a number from 0 to 20.'
		});
		expect(await db.select().from(checkIn)).toHaveLength(0);
	});

	it('turning a day off that was logged twice sets it to zero', async () => {
		// Review Focus 3: a days habit logged twice from Today.
		const me = await makeUser();
		const card = await cardFor(
			me,
			await makeHabits(me.id, 8, { period: 'week', countMode: 'days', target: 2 }),
			OCT_1
		);
		const { id } = habitSquare(card);
		await logCheckIn(db, me, id, '2026-10-19', 1, OCT_20);
		await logCheckIn(db, me, id, '2026-10-19', 1, OCT_20);
		expect(await setCheckIn(db, me, id, '2026-10-19', 0, OCT_20)).toEqual({ ok: true, count: 0 });
		expect((await getCheckIns(db, card.id)).has(id)).toBe(false);
	});

	it('follows the same window and ownership rules as logCheckIn', async () => {
		const me = await makeUser();
		const other = await makeUser();
		const theirs = await cardFor(other, await makeHabits(other.id, 8), OCT_1);
		const mine = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		expect(await setCheckIn(db, me, habitSquare(theirs).id, '2026-10-20', 1, OCT_20)).toBeNull();
		expect(await setCheckIn(db, me, habitSquare(mine).id, '2026-10-21', 1, OCT_20)).toMatchObject({
			ok: false,
			field: 'date'
		});
	});
});

describe('check-ins and card edits', () => {
	it("keeps kept squares' check-ins, drops the rest, and re-evaluates a changed target", async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 9, { period: 'month', countMode: 'days', target: 3 });
		const card = await cardFor(me, habits.slice(0, 8), OCT_1);
		const OCT_2 = new Date('2026-10-02T09:00:00Z');
		const kept = card.squares.find((s) => !s.isCenter && s.habitId === habits[0].id)!;
		const dropped = card.squares.find((s) => !s.isCenter && s.habitId === habits[7].id)!;
		for (const date of ['2026-10-01', '2026-10-02']) {
			await logCheckIn(db, me, kept.id, date, 1, OCT_2);
		}
		await logCheckIn(db, me, dropped.id, '2026-10-02', 1, OCT_2);

		const swap = plan([...habits.slice(0, 7), habits[8]], 3, {
			targets: { [habits[0].id]: 2 }
		});
		const updated = await updateCard(
			db,
			me,
			card.id,
			{ habitIds: swap.habitIds, targets: swap.targets, rewards, layout: swap.layout },
			OCT_2
		);
		if (!updated.ok) throw new Error(updated.message);

		const checkIns = await getCheckIns(db, card.id);
		expect(checkIns.get(kept.id)).toEqual(
			new Map([
				['2026-10-01', 1],
				['2026-10-02', 1]
			])
		);
		expect(checkIns.has(dropped.id)).toBe(false);
		const square = updated.card.squares.find((s) => s.id === kept.id);
		if (!square || square.isCenter) throw new Error('kept square missing');
		expect(evaluateSquare(square, updated.card, checkIns.get(kept.id)!, '2026-10-02').state).toBe(
			'complete'
		);
	});
});

describe('feed highlights', () => {
	const monthly = { period: 'month', countMode: 'days' }; // only these can complete
	const keys = async (cardId: string) =>
		(await db.select({ key: feedEvent.key }).from(feedEvent).where(eq(feedEvent.cardId, cardId)))
			.map((e) => e.key)
			.filter((key) => !key.startsWith('checkin:'))
			.sort();

	it('posts a completed square and removes it on undo', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, monthly), OCT_1);
		const { id } = habitSquare(card);
		await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20);
		expect(await keys(card.id)).toEqual(['card', `square:${id}`]);
		await logCheckIn(db, me, id, '2026-10-20', -1, OCT_20);
		expect(await keys(card.id)).toEqual(['card']);
	});

	it('posts tier:bingo once when a line completes, via setCheckIn too', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, monthly), OCT_1);
		const [a, b, c] = [0, 1, 2].map((i) => habitSquare(card, i).id);
		await logCheckIn(db, me, a, '2026-10-20', 1, OCT_20);
		await logCheckIn(db, me, b, '2026-10-20', 1, OCT_20);
		await setCheckIn(db, me, c, '2026-10-20', 1, OCT_20);
		const all = await keys(card.id);
		expect(all.filter((k) => k === 'tier:bingo')).toHaveLength(1);
		await setCheckIn(db, me, c, '2026-10-20', 0, OCT_20);
		expect(await keys(card.id)).not.toContain('tier:bingo');
	});

	it('the middle reward stores its square count', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, monthly), OCT_1);
		for (const i of [0, 1, 2, 3]) {
			await logCheckIn(db, me, habitSquare(card, i).id, '2026-10-20', 1, OCT_20);
		}
		const [tier] = await db
			.select({ payload: feedEvent.payload })
			.from(feedEvent)
			.where(and(eq(feedEvent.cardId, card.id), eq(feedEvent.key, 'tier:sixtyPercent')));
		expect(tier.payload).toEqual({ squares: 5, rules: 2 });
	});

	it('a reward reached by the month ending posts on the next check-in', async () => {
		const me = await makeUser();
		const limits = { direction: 'atMost', period: 'month', countMode: 'days', target: 3 };
		const card = await cardFor(me, await makeHabits(me.id, 8, limits), OCT_1);
		const NOV_1 = new Date('2026-11-01T09:00:00Z');
		await logCheckIn(db, me, habitSquare(card).id, '2026-10-31', 1, NOV_1);
		expect(await keys(card.id)).toEqual(
			expect.arrayContaining(['tier:bingo', 'tier:sixtyPercent'])
		);
	});

	it('reward highlights from before the rules changed are kept; new ones follow the card', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const tier = (key: string, payload: Record<string, unknown>) => ({
			id: crypto.randomUUID(),
			userId: me.id,
			cardId: card.id,
			type: key.slice('tier:'.length) as 'bingo' | 'blackout',
			key,
			payload,
			createdAt: new Date()
		});
		await db
			.insert(feedEvent)
			.values([tier('tier:bingo', {}), tier('tier:blackout', { rules: 2 })]);
		await logCheckIn(db, me, habitSquare(card).id, '2026-10-20', 1, OCT_20);
		const left = await keys(card.id);
		expect(left).toContain('tier:bingo');
		expect(left).not.toContain('tier:blackout');
	});

	it('simultaneous logs post one bingo', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, monthly), OCT_1);
		const [a, b, c] = [0, 1, 2].map((i) => habitSquare(card, i).id);
		await logCheckIn(db, me, a, '2026-10-20', 1, OCT_20);
		await Promise.all([b, c].map((id) => logCheckIn(db, me, id, '2026-10-20', 1, OCT_20)));
		expect((await keys(card.id)).filter((k) => k === 'tier:bingo')).toHaveLength(1);
	});
});

describe('check-in feed items', () => {
	const items = async (cardId: string) =>
		db
			.select()
			.from(feedEvent)
			.where(and(eq(feedEvent.cardId, cardId), eq(feedEvent.type, 'checkIn')));
	const LATER = new Date('2026-10-20T10:00:00Z');

	it('a log posts a checkIn item with count 1, and a second log updates it and moves it up', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		await logCheckIn(db, me, id, '2026-10-20', 1, OCT_20);
		const [first] = await items(card.id);
		expect(first).toMatchObject({
			userId: me.id,
			key: `checkin:${id}:2026-10-20`,
			payload: { name: 'Habit 0', icon: 'bicycle', date: '2026-10-20', count: 1, backfilled: false }
		});
		await logCheckIn(db, me, id, '2026-10-20', 1, LATER);
		const [second] = await items(card.id);
		expect(second.id).toBe(first.id);
		expect(second.payload).toMatchObject({ count: 2 });
		expect(second.createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime());
	});

	it('lowering the count keeps its place; undo to 0 removes it and its reactions', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, { target: 3 }), OCT_1);
		const { id } = habitSquare(card);
		await setCheckIn(db, me, id, '2026-10-20', 3, OCT_20);
		const [before] = await items(card.id);
		await db.insert(reaction).values({ feedEventId: before.id, userId: me.id, icon: 'heart' });
		await setCheckIn(db, me, id, '2026-10-20', 2, LATER);
		const [after] = await items(card.id);
		expect(after.payload).toMatchObject({ count: 2 });
		expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
		await logCheckIn(db, me, id, '2026-10-20', -1, LATER);
		await logCheckIn(db, me, id, '2026-10-20', -1, LATER);
		expect(await items(card.id)).toHaveLength(0);
		expect(await db.select().from(reaction)).toHaveLength(0);
	});

	it('a backfilled day is marked, and a private habit has no name', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, { isPrivate: true }), OCT_1);
		const { id } = habitSquare(card);
		await logCheckIn(db, me, id, '2026-10-18', 1, OCT_20);
		const [item] = await items(card.id);
		expect(item.payload).toEqual({ private: true, date: '2026-10-18', count: 1, backfilled: true });
	});

	it('a habit made private after the card started posts without its name', async () => {
		const me = await makeUser();
		const habits = await makeHabits(me.id, 8);
		const card = await cardFor(me, habits, OCT_1);
		const square = habitSquare(card);
		const habit = habits.find((h) => h.id === square.habitId)!;
		const made = await updateHabit(db, me.id, habit.id, {
			icon: habit.icon,
			name: habit.name,
			category: habit.category,
			direction: habit.direction,
			period: habit.period,
			countMode: habit.countMode,
			target: habit.target,
			isPrivate: true
		});
		expect(made?.ok).toBe(true);
		await logCheckIn(db, me, square.id, '2026-10-20', 1, OCT_20);
		const [item] = await items(card.id);
		expect(item.payload).toEqual({
			private: true,
			date: '2026-10-20',
			count: 1,
			backfilled: false
		});
	});

	it('a refused write leaves the feed alone', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8), OCT_1);
		const { id } = habitSquare(card);
		const result = await logCheckIn(db, me, id, '2026-10-21', 1, OCT_20);
		expect(result?.ok).toBe(false);
		await logCheckIn(db, me, id, '2026-10-20', -1, OCT_20);
		expect(await items(card.id)).toHaveLength(0);
	});

	it('simultaneous logs leave one item with the final count', async () => {
		const me = await makeUser();
		const card = await cardFor(me, await makeHabits(me.id, 8, { target: 8 }), OCT_1);
		const { id } = habitSquare(card);
		await Promise.all([1, 2].map(() => logCheckIn(db, me, id, '2026-10-20', 1, OCT_20)));
		const all = await items(card.id);
		expect(all).toHaveLength(1);
		expect(all[0].payload).toMatchObject({ count: 2 });
	});
});
