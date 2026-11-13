import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/client.ts';
import type { Card } from '#lib/server/cards.ts';
import { cardDraft, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { emptyDraft } from '#lib/game/card-draft.ts';
import { archiveHabit, createHabit } from './habits';
import { discardDraft, draftFromCard, getDraft, pickedHabits, saveDraft } from './card-drafts';

let db: Db;
let userId: string;

beforeEach(async () => {
	db = await createTestDb();
	userId = crypto.randomUUID();
	await db.insert(user).values({
		id: userId,
		name: 'Someone',
		email: `${userId}@users.invalid`,
		username: `u_${userId.slice(0, 8)}`,
		displayUsername: `u_${userId.slice(0, 8)}`
	});
});

describe('card drafts', () => {
	it('starts empty and saves progress', async () => {
		expect(await getDraft(db, userId, '2026-10')).toEqual(emptyDraft('2026-10'));
		const draft = { ...emptyDraft('2026-10'), size: 3 as const, completed: ['size' as const] };
		await saveDraft(db, userId, draft);
		expect(await getDraft(db, userId, '2026-10')).toEqual(draft);
		const next = { ...draft, habitIds: ['a', 'b'] };
		await saveDraft(db, userId, next);
		expect(await getDraft(db, userId, '2026-10')).toEqual(next);
		await discardDraft(db, userId, '2026-10');
		expect(await getDraft(db, userId, '2026-10')).toEqual(emptyDraft('2026-10'));
	});

	it('forgets a draft from another month', async () => {
		await saveDraft(db, userId, { ...emptyDraft('2026-09'), size: 5 });
		expect(await getDraft(db, userId, '2026-10')).toEqual(emptyDraft('2026-10'));
		expect(await db.select().from(cardDraft).where(eq(cardDraft.userId, userId))).toHaveLength(0);
	});

	it('keeps one draft per month', async () => {
		const october = { ...emptyDraft('2026-10'), cardId: 'card-oct', habitIds: ['a'] };
		const november = { ...emptyDraft('2026-11'), size: 5 as const };
		await saveDraft(db, userId, october);
		await saveDraft(db, userId, november);
		expect(await getDraft(db, userId, '2026-10')).toEqual(october);
		expect(await getDraft(db, userId, '2026-11', '2026-10')).toEqual(november);
		await discardDraft(db, userId, '2026-11');
		expect(await getDraft(db, userId, '2026-10')).toEqual(october);
		expect(await getDraft(db, userId, '2026-11', '2026-10')).toEqual(emptyDraft('2026-11'));
	});

	it('forgets drafts for months before the current one', async () => {
		await saveDraft(db, userId, { ...emptyDraft('2026-09'), size: 3 });
		await saveDraft(db, userId, { ...emptyDraft('2026-10'), size: 5 });
		expect(await getDraft(db, userId, '2026-11', '2026-10')).toEqual(emptyDraft('2026-11'));
		const months = await db.select({ month: cardDraft.month }).from(cardDraft);
		expect(months).toEqual([{ month: '2026-10' }]);
	});

	it('forgets a draft that no longer parses', async () => {
		await db.insert(cardDraft).values({ userId, month: '2026-10', data: { size: 7, nonsense: 1 } });
		expect(await getDraft(db, userId, '2026-10')).toEqual(emptyDraft('2026-10'));
		expect(await db.select().from(cardDraft).where(eq(cardDraft.userId, userId))).toHaveLength(0);
	});

	it('draftFromCard round-trips a card into a complete editing draft', () => {
		const rule = { direction: 'atLeast', period: 'month', countMode: 'days' } as const;
		const square = (position: number, habitId: string, target: number) => ({
			id: `s${position}`,
			position,
			isCenter: false as const,
			habitId,
			icon: 'person-simple-run' as const,
			name: habitId,
			category: 'fitness' as const,
			isPrivate: false,
			...rule,
			target
		});
		const ids = ['h3', 'h1', 'h2', 'h4', 'h5', 'h6', 'h7', 'h8'];
		const layout = [...ids.slice(0, 4), null, ...ids.slice(4)];
		const card: Card = {
			id: 'card-1',
			month: '2026-10',
			size: 3,
			startDate: '2026-10-12',
			editableUntil: new Date('2026-10-14T00:00:00Z'),
			weekStartsOn: 'monday',
			rewards: { bingo: 'a', sixty: 'b', blackout: 'c' },
			squares: layout.map((id, i) =>
				id === null ? { id: 'center', position: i, isCenter: true as const } : square(i, id, i + 1)
			)
		};
		expect(draftFromCard(card)).toEqual({
			month: '2026-10',
			cardId: 'card-1',
			size: 3,
			habitIds: ids,
			// The card's own targets, so editing shows them as they are.
			targets: { h3: 1, h1: 2, h2: 3, h4: 4, h5: 6, h6: 7, h7: 8, h8: 9 },
			rewards: { bingo: 'a', sixty: 'b', blackout: 'c' },
			layout,
			completed: ['habits', 'targets', 'rewards', 'board']
		});

		const big: Card = {
			...card,
			size: 5,
			squares: Array.from({ length: 25 }, (_, i) =>
				i === 12 ? { id: 'center', position: 12, isCenter: true as const } : square(i, `h${i}`, 3)
			)
		};
		const bigDraft = draftFromCard(big);
		expect(bigDraft.layout).toHaveLength(25);
		expect(bigDraft.layout![12]).toBeNull();
		expect(bigDraft.habitIds).toHaveLength(24);
		expect(Object.keys(bigDraft.targets)).toHaveLength(24);
	});

	it('pickedHabits gives the picks in order, or null once one is archived', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 8; i++) {
			const made = await createHabit(db, userId, {
				icon: 'bicycle',
				name: `Habit ${i}`,
				category: 'fitness',
				direction: 'atLeast',
				period: 'week',
				countMode: 'days',
				target: 3,
				isPrivate: false
			});
			if (!made.ok) throw new Error(made.message);
			ids.push(made.habit.id);
		}
		const draft = { ...emptyDraft('2026-10'), size: 3 as const, habitIds: [...ids].reverse() };
		const picked = await pickedHabits(db, userId, draft, 3, new Map());
		expect(picked?.map((h) => h.id)).toEqual([...ids].reverse());
		await archiveHabit(db, userId, ids[0], new Date());
		expect(await pickedHabits(db, userId, draft, 3, new Map())).toBeNull();
	});
});
