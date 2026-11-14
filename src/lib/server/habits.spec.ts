import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/client.ts';
import { cardSquare, habit, user } from '#lib/server/db/schema.ts';
import { startCard } from './cards';
import { createTestDb } from '#lib/server/db/test-db.ts';
import {
	addStarter,
	addedStarterIds,
	archiveHabit,
	deleteHabit,
	createHabit,
	getHabit,
	listHabits,
	restoreHabit,
	updateHabit
} from './habits';
import type { HabitInput } from '#lib/game/types.ts';

let db: Db;

async function makeUser() {
	const id = crypto.randomUUID();
	await db.insert(user).values({
		id,
		name: 'Someone',
		email: `${id}@users.invalid`,
		username: `u_${id.slice(0, 8)}`,
		displayUsername: `u_${id.slice(0, 8)}`
	});
	return id;
}

function input(overrides: Partial<HabitInput> = {}): HabitInput {
	return {
		icon: 'bicycle',
		name: 'Go biking',
		category: 'fitness',
		direction: 'atLeast',
		period: 'month',
		countMode: 'times',
		target: '3',
		isPrivate: false,
		...overrides
	};
}

async function created(userId: string, overrides: Partial<HabitInput> = {}) {
	const result = await createHabit(db, userId, input(overrides));
	if (!result.ok) throw new Error(`create failed: ${result.message}`);
	return result.habit;
}

beforeEach(async () => {
	db = await createTestDb();
});

describe('createHabit', () => {
	it('creates a habit with normalized rule and trimmed name', async () => {
		const me = await makeUser();
		const result = await createHabit(
			db,
			me,
			input({ name: '  Drink water  ', icon: 'drop', period: 'day', countMode: 'days', target: 8 })
		);
		expect(result).toMatchObject({
			ok: true,
			habit: {
				icon: 'drop',
				name: 'Drink water',
				category: 'fitness',
				direction: 'atLeast',
				period: 'day',
				countMode: 'times',
				target: 8,
				isPrivate: false,
				archivedAt: null
			}
		});
	});

	it.each([
		[{ name: '' }, 'name', 'Give it a name (up to 40 characters).'],
		[{ name: 'x'.repeat(41) }, 'name', 'Give it a name (up to 40 characters).'],
		[{ icon: 'ab' }, 'icon', 'Pick an icon.'],
		[{ icon: 'not-an-icon' }, 'icon', 'Pick an icon.'],
		[{ icon: '🚴' }, 'icon', 'Pick an icon.'],
		[{ icon: 'lock' }, 'icon', 'Pick an icon.'],
		[{ category: 'sports' }, 'category', 'Pick a category.'],
		[{ direction: 'atMost', period: 'day', target: '20' }, 'target', 'Pick a number from 1 to 19.'],
		[{ target: '0' }, 'target', 'Pick a number from 1 to 100.']
	])('rejects %o on %s', async (overrides, field, message) => {
		const me = await makeUser();
		expect(await createHabit(db, me, input(overrides))).toEqual({ ok: false, field, message });
		expect(await listHabits(db, me)).toEqual([]);
	});

	it('stops at 100 active habits but counts archived ones as free', async () => {
		const me = await makeUser();
		for (let i = 0; i < 100; i++) await created(me, { name: `Habit ${i}` });
		expect(await createHabit(db, me, input({ name: 'One too many' }))).toEqual({
			ok: false,
			field: 'form',
			message: 'You can have up to 100 habits. Archive some to add more.'
		});
		const [first] = await listHabits(db, me);
		await archiveHabit(db, me, first.id, new Date());
		expect(await createHabit(db, me, input({ name: 'Now it fits' }))).toMatchObject({ ok: true });
	});
});

describe('listHabits', () => {
	it('lists only my active habits, ordered by category then name', async () => {
		const me = await makeUser();
		const them = await makeUser();
		await created(me, { name: 'zebra', category: 'other' });
		await created(me, { name: 'Read', category: 'learning' });
		await created(me, { name: 'bike', category: 'fitness' });
		await created(me, { name: 'Abs', category: 'fitness' });
		await created(them, { name: 'Theirs' });
		const archived = await created(me, { name: 'Old one' });
		await archiveHabit(db, me, archived.id, new Date());

		expect((await listHabits(db, me)).map((h) => h.name)).toEqual(['Abs', 'bike', 'Read', 'zebra']);
	});

	it('filters by category and lists archived separately', async () => {
		const me = await makeUser();
		await created(me, { name: 'Bike', category: 'fitness' });
		await created(me, { name: 'Read', category: 'learning' });
		const old = await created(me, { name: 'Old', category: 'learning' });
		await archiveHabit(db, me, old.id, new Date());

		expect((await listHabits(db, me, { category: 'learning' })).map((h) => h.name)).toEqual([
			'Read'
		]);
		expect((await listHabits(db, me, { archived: true })).map((h) => h.name)).toEqual(['Old']);
	});
});

describe('ownership', () => {
	it("never returns, updates, archives or restores another user's habit", async () => {
		const me = await makeUser();
		const them = await makeUser();
		const theirs = await created(them, { name: 'Theirs' });

		expect(await getHabit(db, me, theirs.id)).toBeNull();
		expect(await updateHabit(db, me, theirs.id, input({ name: 'Mine now' }))).toBeNull();
		expect(await archiveHabit(db, me, theirs.id, new Date())).toBe(false);
		expect(await restoreHabit(db, me, theirs.id)).toBe(false);
		expect(await getHabit(db, me, 'not-a-real-id')).toBeNull();

		expect(await getHabit(db, them, theirs.id)).toMatchObject({ name: 'Theirs', archivedAt: null });
	});
});

describe('updateHabit', () => {
	it('updates fields with the same validation', async () => {
		const me = await makeUser();
		const mine = await created(me);
		expect(
			await updateHabit(db, me, mine.id, input({ name: 'Bike to work', isPrivate: true }))
		).toMatchObject({ ok: true, habit: { id: mine.id, name: 'Bike to work', isPrivate: true } });
		expect(await updateHabit(db, me, mine.id, input({ name: '' }))).toEqual({
			ok: false,
			field: 'name',
			message: 'Give it a name (up to 40 characters).'
		});
	});
});

describe('deleteHabit', () => {
	it('deletes an archived habit forever', async () => {
		const me = await makeUser();
		const mine = await created(me);
		await archiveHabit(db, me, mine.id, new Date());
		expect(await deleteHabit(db, me, mine.id)).toBe(true);
		expect(await getHabit(db, me, mine.id)).toBeNull();
		expect(await db.select().from(habit)).toEqual([]);
	});

	it('refuses an active habit', async () => {
		const me = await makeUser();
		const mine = await created(me);
		expect(await deleteHabit(db, me, mine.id)).toBe('active');
		expect(await getHabit(db, me, mine.id)).not.toBeNull();
	});

	it("never deletes another person's habit", async () => {
		const me = await makeUser();
		const other = await makeUser();
		const theirs = await created(other);
		await archiveHabit(db, other, theirs.id, new Date());
		expect(await deleteHabit(db, me, theirs.id)).toBe(false);
		expect(await deleteHabit(db, me, 'no-such-habit')).toBe(false);
		expect(await getHabit(db, other, theirs.id)).not.toBeNull();
	});

	it('cards keep their copy of a deleted habit', async () => {
		const me = await makeUser();
		const habits = [];
		for (let i = 0; i < 8; i++) habits.push(await created(me, { name: `Habit ${i}` }));
		const layout: (string | null)[] = habits.map((h) => h.id);
		layout.splice(4, 0, null);
		const started = await startCard(
			db,
			{ id: me, timezone: 'UTC', weekStartsOn: 'monday' },
			{
				size: 3,
				habitIds: habits.map((h) => h.id),
				targets: {},
				rewards: { bingo: 'a', sixty: 'b', blackout: 'c' },
				layout
			},
			new Date('2026-10-12T09:00:00Z')
		);
		if (!started.ok) throw new Error(started.message);
		await archiveHabit(db, me, habits[0].id, new Date());
		expect(await deleteHabit(db, me, habits[0].id)).toBe(true);
		const squares = await db.select().from(cardSquare).where(eq(cardSquare.name, 'Habit 0'));
		expect(squares).toHaveLength(1);
		expect(squares[0]).toMatchObject({ habitId: null, icon: habits[0].icon });
	});
});

describe('archive and restore', () => {
	it('archiving is idempotent and keeps the row', async () => {
		const me = await makeUser();
		const mine = await created(me);
		const first = new Date('2026-10-12T10:00:00Z');
		expect(await archiveHabit(db, me, mine.id, first)).toBe(true);
		expect(await archiveHabit(db, me, mine.id, new Date('2026-10-13T10:00:00Z'))).toBe(true);
		expect(await getHabit(db, me, mine.id)).toMatchObject({ archivedAt: first });
		expect(await listHabits(db, me)).toEqual([]);
	});

	it('restoring brings it back to the active list', async () => {
		const me = await makeUser();
		const mine = await created(me);
		await archiveHabit(db, me, mine.id, new Date());
		expect(await restoreHabit(db, me, mine.id)).toBe(true);
		expect(await restoreHabit(db, me, mine.id)).toBe(true);
		expect((await listHabits(db, me)).map((h) => h.id)).toEqual([mine.id]);
	});

	it('refuses to restore past 100 active habits', async () => {
		const me = await makeUser();
		const old = await created(me, { name: 'Old' });
		await archiveHabit(db, me, old.id, new Date());
		for (let i = 0; i < 100; i++) await created(me, { name: `Habit ${i}` });
		expect(await restoreHabit(db, me, old.id)).toBe('full');
	});
});

it('deleting a user deletes their habits', async () => {
	const me = await makeUser();
	await created(me);
	await db.delete(user).where(eq(user.id, me));
	expect(await db.select().from(habit)).toEqual([]);
});

describe('addStarter', () => {
	it('adding a starter creates the habit once', async () => {
		const me = await makeUser();
		expect(await addStarter(db, me, 'bike')).toEqual({ ok: true, added: true });
		expect(await addStarter(db, me, 'bike')).toEqual({ ok: true, added: false });
		const habits = await listHabits(db, me);
		expect(habits).toHaveLength(1);
		expect(habits[0]).toMatchObject({
			icon: 'bicycle',
			name: 'Go biking',
			category: 'fitness',
			direction: 'atLeast',
			period: 'month',
			countMode: 'times',
			target: 3,
			isPrivate: false
		});
	});

	it('treats a same-named habit in another casing as already added', async () => {
		const me = await makeUser();
		await created(me, { name: 'go BIKING' });
		expect(await addStarter(db, me, 'bike')).toEqual({ ok: true, added: false });
	});

	it('two simultaneous adds create one habit', async () => {
		const me = await makeUser();
		await Promise.all([addStarter(db, me, 'water'), addStarter(db, me, 'water')]);
		expect(await listHabits(db, me)).toHaveLength(1);
	});

	it('a starter matching an archived habit is added again', async () => {
		const me = await makeUser();
		await addStarter(db, me, 'meditate');
		const [old] = await listHabits(db, me);
		await archiveHabit(db, me, old.id, new Date());
		expect(await addStarter(db, me, 'meditate')).toEqual({ ok: true, added: true });
		expect(await listHabits(db, me)).toHaveLength(1);
	});

	it('unknown starter ids are refused', async () => {
		const me = await makeUser();
		expect(await addStarter(db, me, 'skydiving')).toEqual({
			ok: false,
			message: 'Unknown suggestion.'
		});
	});

	it('respects the 100-habit cap', async () => {
		const me = await makeUser();
		for (let i = 0; i < 100; i++) await created(me, { name: `Habit ${i}` });
		expect(await addStarter(db, me, 'naps')).toEqual({
			ok: false,
			message: 'You can have up to 100 habits. Archive some to add more.'
		});
	});

	it('reports which starters are already in the library', async () => {
		const me = await makeUser();
		await addStarter(db, me, 'bike');
		await addStarter(db, me, 'naps');
		expect(addedStarterIds(await listHabits(db, me))).toEqual(['bike', 'naps']);
	});
});
