import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_SIZES } from '#lib/game/card-layout.ts';
import type { Db } from '#lib/server/db/client.ts';
import { cardSquare, habit, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { eq } from 'drizzle-orm';
import { startCard, type CardPlan } from './cards.ts';
import { logCheckIn } from './check-ins.ts';
import { createGroup, getMembership, joinGroup } from './groups.ts';
import { createHabit, updateHabit, type Habit } from './habits.ts';
import { groupBoard, memberCard } from './leaderboard.ts';

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

async function makeHabits(userId: string, overrides: Record<string, unknown> = {}) {
	const habits: Habit[] = [];
	for (let i = 0; i < 8; i++) {
		const result = await createHabit(db, userId, {
			icon: 'bicycle',
			name: `Habit ${i}`,
			category: 'fitness',
			direction: 'atLeast',
			period: 'month',
			countMode: 'days',
			target: 1,
			isPrivate: false,
			...overrides
		});
		if (!result.ok) throw new Error(result.message);
		habits.push(result.habit);
	}
	return habits;
}

async function cardFor(u: TestUser, at: string, overrides: Record<string, unknown> = {}) {
	const ids = (await makeHabits(u.id, overrides)).map((h) => h.id);
	const layout: (string | null)[] = [...ids];
	layout.splice(CARD_SIZES[3].centerPosition, 0, null);
	const plan: CardPlan = {
		size: 3,
		habitIds: ids,
		targets: {},
		rewards: { bingo: 'Pizza', sixty: 'Movie night', blackout: 'Weekend away' },
		layout
	};
	const result = await startCard(db, u, plan, new Date(at));
	if (!result.ok) throw new Error(result.message);
	return result.card;
}

/** Logs the first `n` habit squares on `date`. */
async function logSome(
	u: TestUser,
	card: Awaited<ReturnType<typeof cardFor>>,
	n: number,
	date: string
) {
	const at = new Date(`${date}T12:00:00Z`);
	for (const square of card.squares.filter((s) => !s.isCenter).slice(0, n)) {
		await logCheckIn(db, u, square.id, date, 1, at);
	}
}

async function setup(...others: TestUser[]) {
	const owner = await makeUser();
	const created = await createGroup(db, owner.id, { name: 'Crew', icon: 'rocket' }, new Date());
	if (!created.ok) throw new Error(created.message);
	const code = (await getMembership(db, owner.id, created.groupId, new Date()))!.inviteCode;
	for (const o of others) await joinGroup(db, o.id, code, new Date());
	return { owner, groupId: created.groupId };
}

const OCT_1 = '2026-10-01T09:00:00Z';

beforeEach(async () => {
	db = await createTestDb();
});

describe('groupBoard', () => {
	it('ranks by % complete, puts no-card last, flags the viewer, hides from strangers', async () => {
		const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
		const { groupId } = await setup(a, b, c);
		await logSome(a, await cardFor(a, OCT_1), 2, '2026-10-20');
		await logSome(b, await cardFor(b, OCT_1), 4, '2026-10-20');
		const now = new Date('2026-10-20T15:00:00Z');
		const board = (await groupBoard(db, a.id, groupId, now))!;
		expect(board.rows.map((r) => r.userId).slice(0, 2)).toEqual([b.id, a.id]);
		const top = board.rows[0];
		expect(top.percent).toBeGreaterThan(board.rows[1].percent!);
		expect(top).not.toHaveProperty('points');
		expect(board.rows.at(-1)!.percent).toBeNull();
		expect(board.rows.at(-1)!.rank).toBeNull();
		expect(board.rows.filter((r) => r.isViewer).map((r) => r.userId)).toEqual([a.id]);
		expect(board.rows).toHaveLength(4);
		expect(board).not.toHaveProperty('provisionalMonth');
		const stranger = await makeUser();
		expect(await groupBoard(db, stranger.id, groupId, now)).toBeNull();
	});

	it('scores each member on their own local month', async () => {
		const kiri = await makeUser('Pacific/Kiritimati');
		const utc = await makeUser();
		const { groupId } = await setup(kiri, utc);
		await logSome(kiri, await cardFor(kiri, OCT_1), 2, '2026-10-30');
		await logSome(utc, await cardFor(utc, OCT_1), 2, '2026-10-30');
		const board = (await groupBoard(db, utc.id, groupId, new Date('2026-10-31T11:30:00Z')))!;
		expect(board.rows.find((r) => r.userId === kiri.id)!.percent).toBeNull();
		expect(board.rows.find((r) => r.userId === utc.id)!.percent).toBeGreaterThan(0);
	});
});

describe('memberCard', () => {
	it('shows the current card with private habits as a lock and no rewards', async () => {
		const mate = await makeUser();
		const { owner, groupId } = await setup(mate);
		const card = await cardFor(mate, OCT_1, { isPrivate: true });
		// Swap one square to a public habit: it must still show its name.
		const [pub] = await makeHabits(mate.id, { name: 'Public one', icon: 'flower-lotus' });
		const target = card.squares.find((s) => !s.isCenter)!;
		await db
			.update(cardSquare)
			.set({ habitId: pub.id, name: pub.name, icon: pub.icon, isPrivate: false })
			.where(eq(cardSquare.id, target.id));
		const now = new Date('2026-10-20T09:00:00Z');
		const view = (await memberCard(db, owner.id, groupId, mate.id, now))!;
		expect(view.monthName).toBe('October');
		const habits = view.card!.squares.filter((s) => s.name !== 'Free');
		expect(habits.filter((s) => s.name === 'Private' && s.icon === 'lock')).toHaveLength(7);
		expect(habits.filter((s) => s.name === 'Public one' && s.icon === 'flower-lotus')).toHaveLength(
			1
		);
		expect(view.card!.squares.some((s) => 'id' in s || 'link' in s)).toBe(false);
		expect(view.card).not.toHaveProperty('rewards');
		expect(view).not.toHaveProperty('rewards');
	});

	it('hides a habit made private after the card started', async () => {
		const mate = await makeUser();
		const { owner, groupId } = await setup(mate);
		const card = await cardFor(mate, OCT_1);
		const square = card.squares.find((s) => !s.isCenter)!;
		const [h] = await db.select().from(habit).where(eq(habit.id, square.habitId!));
		await updateHabit(db, mate.id, h.id, {
			icon: h.icon,
			name: h.name,
			category: h.category,
			direction: h.direction,
			period: h.period,
			countMode: h.countMode,
			target: h.target,
			isPrivate: true
		});
		const view = (await memberCard(
			db,
			owner.id,
			groupId,
			mate.id,
			new Date('2026-10-20T09:00:00Z')
		))!;
		expect(
			view.card!.squares.filter((s) => s.name === 'Private' && s.icon === 'lock')
		).toHaveLength(1);
		expect(view.card!.squares.some((s) => s.name === h.name)).toBe(false);
	});

	it('is null outside this group, and card is null without a card', async () => {
		const mate = await makeUser();
		const { owner, groupId } = await setup(mate);
		const now = new Date('2026-10-20T09:00:00Z');
		expect((await memberCard(db, owner.id, groupId, mate.id, now))!.card).toBeNull();
		const lone = await makeUser();
		const shared = await createGroup(db, lone.id, { name: 'Other', icon: 'plant' }, now);
		if (!shared.ok) throw new Error(shared.message);
		const code = (await getMembership(db, lone.id, shared.groupId, now))!.inviteCode;
		await joinGroup(db, owner.id, code, now);
		// lone shares a group with owner, but is not in `groupId`.
		expect(await memberCard(db, owner.id, groupId, lone.id, now)).toBeNull();
		expect(await memberCard(db, lone.id, groupId, mate.id, now)).toBeNull();
	});
});
