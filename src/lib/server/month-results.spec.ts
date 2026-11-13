import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_SIZES } from '#lib/game/card-layout.ts';
import type { Db } from '#lib/server/db/client.ts';
import { feedEvent, monthResult, user } from '#lib/server/db/schema.ts';
import { eq } from 'drizzle-orm';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { cardView } from './card-view.ts';
import { startCard, type Card, type CardPlan } from './cards.ts';
import { logCheckIn } from './check-ins.ts';
import { localDate } from './clock.ts';
import { createHabit, type Habit } from './habits.ts';
import { finalizeMonths, getResult, listResults, markSeen, newestUnseen } from './month-results.ts';

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

function plan(habits: Habit[]): CardPlan {
	const ids = habits.map((h) => h.id);
	const layout: (string | null)[] = [...ids];
	layout.splice(CARD_SIZES[3].centerPosition, 0, null);
	const rewards = { bingo: 'Pizza', sixty: 'Movie night', blackout: 'Weekend away' };
	return { size: 3, habitIds: ids, targets: {}, rewards, layout };
}

async function cardFor(u: TestUser, at: string, overrides: Record<string, unknown> = {}) {
	const result = await startCard(db, u, plan(await makeHabits(u.id, overrides)), new Date(at));
	if (!result.ok) throw new Error(result.message);
	return result.card;
}

const habitSquares = (card: Card) => card.squares.filter((s) => !s.isCenter);
const OCT_1 = '2026-10-01T09:00:00Z';

beforeEach(async () => {
	db = await createTestDb();
});

describe('finalizeMonths', () => {
	it("saves the month's score once it is final, from the 4th (spec §3.8)", async () => {
		const me = await makeUser();
		const card = await cardFor(me, OCT_1, { period: 'month', countMode: 'days', target: 1 });
		const at = new Date('2026-10-20T09:00:00Z');
		for (const square of habitSquares(card).slice(0, 3)) {
			await logCheckIn(db, me, square.id, '2026-10-20', 1, at);
		}

		await finalizeMonths(db, me.id, '2026-11-03');
		expect(await listResults(db, me.id)).toEqual([]);

		await finalizeMonths(db, me.id, '2026-11-04');
		const { score } = await cardView(db, me.id, card, '2026-11-04');
		const saved = await getResult(db, me.id, '2026-10');
		expect(saved?.points).toBeNull(); // no longer written; the column is dropped later
		expect(saved).toMatchObject({
			month: '2026-10',
			lines: score.lines.length,
			tiers: score.tiers,
			squaresCounting: score.counting,
			size: 3,
			seenAt: null
		});
		expect(score.counting).toBe(3);
	});

	it('unmet day and week habits end lost, not at risk', async () => {
		const days = await makeUser();
		await cardFor(days, OCT_1);
		const weeks = await makeUser();
		await cardFor(weeks, OCT_1, { period: 'week', countMode: 'days', target: 2 });
		for (const u of [days, weeks]) {
			await finalizeMonths(db, u.id, '2026-11-04');
			expect((await getResult(db, u.id, '2026-10'))?.squaresCounting).toBe(0);
		}
	});

	it("counts the center only if next month's card was built by the 3rd (spec §3.5)", async () => {
		const early = await makeUser();
		await cardFor(early, OCT_1);
		await cardFor(early, '2026-11-02T09:00:00Z');
		await finalizeMonths(db, early.id, '2026-11-04');
		expect((await getResult(db, early.id, '2026-10'))?.squaresCounting).toBe(1);

		const late = await makeUser();
		await cardFor(late, OCT_1);
		await finalizeMonths(db, late.id, '2026-11-04');
		await cardFor(late, '2026-11-05T09:00:00Z');
		await finalizeMonths(db, late.id, '2026-11-05');
		expect((await getResult(db, late.id, '2026-10'))?.squaresCounting).toBe(0);
	});

	it("a next card built after the 3rd doesn't count the center, even before finalizing", async () => {
		// Away Nov 1–5: the card is built on Nov 5, and October is finalized only after that.
		const away = await makeUser();
		const october = await cardFor(away, OCT_1);
		await cardFor(away, '2026-11-05T09:00:00Z');
		await finalizeMonths(db, away.id, '2026-11-05');
		expect((await getResult(db, away.id, '2026-10'))?.squaresCounting).toBe(0);
		// The recap's board agrees with the saved result.
		const { squares } = await cardView(db, away.id, october, '2026-11-05');
		expect(squares[CARD_SIZES[3].centerPosition].state).toBe('buildNext');
	});

	it('finalizing posts the rewards the month ended with', async () => {
		const me = await makeUser();
		const card = await cardFor(me, OCT_1, {
			direction: 'atMost',
			period: 'month',
			countMode: 'days',
			target: 3
		});
		await finalizeMonths(db, me.id, '2026-11-04');
		const posted = await db
			.select({ key: feedEvent.key })
			.from(feedEvent)
			.where(eq(feedEvent.cardId, card.id));
		expect(posted.map((e) => e.key)).toEqual(
			expect.arrayContaining(['tier:bingo', 'tier:sixtyPercent'])
		);
	});

	it('two at once save one result', async () => {
		const me = await makeUser();
		await cardFor(me, OCT_1);
		await Promise.all([
			finalizeMonths(db, me.id, '2026-11-04'),
			finalizeMonths(db, me.id, '2026-11-04')
		]);
		expect(await db.select().from(monthResult)).toHaveLength(1);
	});

	it('skips months without a card and never the current month', async () => {
		const me = await makeUser();
		await cardFor(me, '2026-09-10T09:00:00Z');
		await cardFor(me, '2026-11-01T09:00:00Z');
		await finalizeMonths(db, me.id, '2026-11-04');
		expect((await listResults(db, me.id)).map((r) => r.month)).toEqual(['2026-09']);
	});

	it("uses the person's own today", async () => {
		const ahead = await makeUser('Pacific/Kiritimati');
		await cardFor(ahead, OCT_1);
		const behind = await makeUser();
		await cardFor(behind, OCT_1);
		// 2026-11-03T11:30Z is already November 4 in Kiritimati.
		const at = new Date('2026-11-03T11:30:00Z');
		await finalizeMonths(db, ahead.id, localDate(at, ahead.timezone));
		await finalizeMonths(db, behind.id, localDate(at, behind.timezone));
		expect(await getResult(db, ahead.id, '2026-10')).not.toBeNull();
		expect(await getResult(db, behind.id, '2026-10')).toBeNull();
	});
});

describe('results', () => {
	it('lists newest first, and the banner shows only the newest unseen', async () => {
		const me = await makeUser();
		await cardFor(me, '2026-09-10T09:00:00Z');
		await cardFor(me, OCT_1);
		await finalizeMonths(db, me.id, '2026-11-04');
		expect((await listResults(db, me.id)).map((r) => r.month)).toEqual(['2026-10', '2026-09']);
		expect((await newestUnseen(db, me.id))?.month).toBe('2026-10');

		await markSeen(db, me.id, '2026-10', new Date('2026-11-04T10:00:00Z'));
		expect(await newestUnseen(db, me.id)).toBeNull();
		expect((await getResult(db, me.id, '2026-10'))?.seenAt).toEqual(
			new Date('2026-11-04T10:00:00Z')
		);
	});

	it("marking seen touches only the person's own result", async () => {
		const me = await makeUser();
		const other = await makeUser();
		await cardFor(other, OCT_1);
		await finalizeMonths(db, other.id, '2026-11-04');
		await markSeen(db, me.id, '2026-10', new Date());
		await markSeen(db, me.id, 'not-a-month', new Date());
		expect((await newestUnseen(db, other.id))?.month).toBe('2026-10');
	});
});
