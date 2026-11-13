import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/client.ts';
import { card, feedEvent, group, groupMember, reaction, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { groupFeed, postCardStarted, react, syncHighlights } from './feed.ts';

let db: Db;

async function makeUser(): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(user).values({
		id,
		name: 'Someone',
		email: `${id}@users.invalid`,
		username: `u_${id.slice(0, 8)}`,
		displayUsername: `u_${id.slice(0, 8)}`,
		timezone: 'UTC',
		weekStartsOn: 'monday'
	});
	return id;
}

async function makeCard(userId: string) {
	const id = crypto.randomUUID();
	await db.insert(card).values({
		id,
		userId,
		month: '2026-10',
		size: 3,
		startDate: '2026-10-01',
		editableUntil: new Date('2026-10-04T00:00:00Z'),
		weekStartsOn: 'monday',
		rewardBingo: 'a',
		rewardSixty: 'b',
		rewardBlackout: 'c'
	});
	return { id, userId, month: '2026-10', size: 3 as const };
}

async function makeGroup(...members: string[]): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(group).values({ id, name: 'Crew' });
	for (const userId of members) {
		await db.insert(groupMember).values({ groupId: id, userId, role: 'member' });
	}
	return id;
}

const events = (cardId: string) => db.select().from(feedEvent).where(eq(feedEvent.cardId, cardId));

beforeEach(async () => {
	db = await createTestDb();
});

describe('postCardStarted', () => {
	it('is idempotent', async () => {
		const c = await makeCard(await makeUser());
		await postCardStarted(db, c);
		await postCardStarted(db, c);
		const rows = await events(c.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ type: 'cardStarted', payload: { month: '2026-10' } });
	});
});

describe('syncHighlights', () => {
	const squares = [
		{ id: 's1', name: 'Run', icon: 'bicycle', isPrivate: false },
		{ id: 's2', name: 'Secret', icon: 'lock', isPrivate: true }
	];

	it('stores name and icon, or private, and is idempotent', async () => {
		const c = await makeCard(await makeUser());
		const changes = { post: ['square:s1', 'square:s2', 'tier:bingo'], remove: [] };
		await syncHighlights(db, c, squares, changes);
		await syncHighlights(db, c, squares, changes);
		const byKey = Object.fromEntries((await events(c.id)).map((e) => [e.key, e]));
		expect(Object.keys(byKey)).toHaveLength(3);
		expect(byKey['square:s1']).toMatchObject({
			type: 'squareComplete',
			payload: { name: 'Run', icon: 'bicycle' }
		});
		expect(byKey['square:s2'].payload).toEqual({ private: true });
		expect(byKey['tier:bingo']).toMatchObject({ type: 'bingo', payload: {} });
	});

	it('removal deletes the event and its reactions', async () => {
		const me = await makeUser();
		const c = await makeCard(me);
		await makeGroup(me);
		await syncHighlights(db, c, squares, { post: ['square:s1'], remove: [] });
		const [event] = await events(c.id);
		await react(db, me, event.id, 'heart');
		await syncHighlights(db, c, squares, { post: [], remove: ['square:s1'] });
		expect(await events(c.id)).toHaveLength(0);
		expect(await db.select().from(reaction)).toHaveLength(0);
	});
});

describe('react', () => {
	it('adds, switches, removes; rejects bad icons and strangers', async () => {
		const [a, b, stranger] = [await makeUser(), await makeUser(), await makeUser()];
		await makeGroup(a, b);
		const c = await makeCard(a);
		await postCardStarted(db, c);
		const [event] = await events(c.id);
		expect(await react(db, b, event.id, 'heart')).toBe('added');
		expect(await react(db, b, event.id, 'fire')).toBe('switched');
		expect(await react(db, b, event.id, 'fire')).toBe('removed');
		expect(await react(db, b, event.id, 'rocket')).toBe('badIcon');
		expect(await react(db, stranger, event.id, 'heart')).toBe('notFound');
		expect(await react(db, b, 'nope', 'heart')).toBe('notFound');
	});
});

describe('groupFeed', () => {
	it('is null for a non-member and lists newest first with reactions', async () => {
		const [a, b, outsider] = [await makeUser(), await makeUser(), await makeUser()];
		const g = await makeGroup(a, b);
		expect(await groupFeed(db, outsider, g)).toBeNull();
		const c = await makeCard(a);
		const base = { userId: a, cardId: c.id, payload: {} };
		await db.insert(feedEvent).values([
			{
				...base,
				id: 'e1',
				type: 'cardStarted',
				key: 'card',
				createdAt: new Date('2026-10-01T00:00:00Z')
			},
			{
				...base,
				id: 'e2',
				type: 'bingo',
				key: 'tier:bingo',
				createdAt: new Date('2026-10-02T00:00:00Z')
			}
		]);
		await react(db, b, 'e2', 'trophy');
		const feed = await groupFeed(db, b, g);
		expect(feed?.items.map((i) => i.id)).toEqual(['e2', 'e1']);
		expect(feed?.items[0]).toMatchObject({ mine: 'trophy', author: { userId: a } });
		expect(feed?.items[0].reactions.trophy).toBe(1);
		expect(feed?.olderCursor).toBeNull();
	});

	it('drops a departed member events but keeps their reactions on others', async () => {
		const [a, b] = [await makeUser(), await makeUser()];
		const g = await makeGroup(a, b);
		const [ca, cb] = [await makeCard(a), await makeCard(b)];
		await postCardStarted(db, ca);
		await postCardStarted(db, cb);
		const [ea] = await events(ca.id);
		await react(db, b, ea.id, 'star');
		await db.delete(groupMember).where(eq(groupMember.userId, a));
		const feed = await groupFeed(db, b, g);
		expect(feed?.items.map((i) => i.author.userId)).toEqual([b]);
		expect(await db.select().from(reaction)).toHaveLength(1);
	});

	it('pages 30 then 5', async () => {
		const a = await makeUser();
		const g = await makeGroup(a);
		const c = await makeCard(a);
		await db.insert(feedEvent).values(
			Array.from({ length: 35 }, (_, i) => ({
				id: `e${String(i).padStart(2, '0')}`,
				userId: a,
				cardId: c.id,
				type: 'squareComplete' as const,
				key: `square:${i}`,
				payload: {},
				createdAt: new Date(Date.UTC(2026, 9, 1, 0, i))
			}))
		);
		const first = await groupFeed(db, a, g);
		expect(first?.items).toHaveLength(30);
		const second = await groupFeed(db, a, g, first?.olderCursor ?? undefined);
		expect(second?.items).toHaveLength(5);
		expect(second?.olderCursor).toBeNull();
		expect(second?.items[0].id).toBe('e04');
	});
});
