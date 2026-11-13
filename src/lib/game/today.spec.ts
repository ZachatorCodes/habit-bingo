import { describe, expect, it } from 'vitest';
import type { CardSpan } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';
import { nudgeSquares, progressText, todayRows, todaySection } from './today.ts';

const span: CardSpan = { startDate: '2026-10-01', weekStartsOn: 'monday' };
const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));
const rule = (
	direction: HabitRule['direction'],
	period: HabitRule['period'],
	countMode: HabitRule['countMode'],
	target: number
): HabitRule => ({ direction, period, countMode, target });
const TODAY = '2026-10-20'; // Tuesday; its Monday week is Oct 19–25

describe('todaySection', () => {
	it('limits are slips and earn squares are anytime', () => {
		expect(todaySection(rule('atMost', 'day', 'times', 1), span, counts({}), TODAY)).toBe('slip');
		expect(todaySection(rule('atMost', 'month', 'days', 3), span, counts({}), TODAY)).toBe('slip');
		expect(todaySection(rule('atLeast', 'month', 'days', 4), span, counts({}), TODAY)).toBe(
			'anytime'
		);
	});

	it('day habits are to do until the day is met', () => {
		const water = rule('atLeast', 'day', 'times', 8);
		expect(todaySection(water, span, counts({ [TODAY]: 7 }), TODAY)).toBe('doToday');
		expect(todaySection(water, span, counts({ [TODAY]: 8 }), TODAY)).toBe('done');
		// An earlier day is judged on its own count.
		expect(todaySection(water, span, counts({ [TODAY]: 8 }), '2026-10-19')).toBe('doToday');
	});

	it('week habits are this week until the week is met', () => {
		const gym = rule('atLeast', 'week', 'days', 3);
		const two = counts({ '2026-10-19': 1, '2026-10-20': 1 });
		expect(todaySection(gym, span, two, TODAY)).toBe('thisWeek');
		expect(
			todaySection(gym, span, counts({ ...Object.fromEntries(two), '2026-10-21': 1 }), '2026-10-21')
		).toBe('done');
	});
});

describe('progressText', () => {
	it('day habits count the day', () => {
		const water = rule('atLeast', 'day', 'times', 8);
		expect(progressText(water, span, counts({ [TODAY]: 5 }), TODAY, TODAY)).toBe('5/8 today');
		expect(progressText(water, span, counts({ '2026-10-18': 3 }), '2026-10-18', TODAY)).toBe(
			'3/8 on Sunday'
		);
	});

	it('week habits say how many more and how many days are left, clipped to the card', () => {
		const gym = rule('atLeast', 'week', 'days', 3);
		// Tuesday through Sunday is 6 days, counting today.
		expect(progressText(gym, span, counts({ '2026-10-19': 1, [TODAY]: 1 }), TODAY, TODAY)).toBe(
			'1 more · 6 days left'
		);
		// Oct 1–4 is a 4-day stub week needing 2.
		expect(progressText(gym, span, counts({}), '2026-10-02', '2026-10-02')).toBe(
			'2 more · 3 days left'
		);
		expect(progressText(gym, span, counts({}), '2026-10-25', '2026-10-25')).toBe(
			'3 more · 1 day left'
		);
		// Backfilling last Sunday: its week is over.
		expect(progressText(gym, span, counts({ '2026-10-12': 1 }), '2026-10-18', TODAY)).toBe(
			'2 more · last week'
		);
		const met = counts({ '2026-10-19': 1, [TODAY]: 1, '2026-10-21': 1 });
		expect(progressText(gym, span, met, TODAY, TODAY)).toBe('3 of 3 this week');
	});

	it('month habits say how many more and how many days are left', () => {
		const read = rule('atLeast', 'month', 'times', 10);
		// Oct 20–31 is 12 days, counting today.
		expect(
			progressText(read, span, counts({ '2026-10-02': 3, '2026-10-12': 1 }), TODAY, TODAY)
		).toBe('6 more · 12 days left');
		expect(progressText(read, span, counts({ '2026-10-02': 12 }), TODAY, TODAY)).toBe(
			'12 of 10 this month'
		);
	});

	it("last month's rows, backfilled on the 1st–3rd, say the month is over", () => {
		const NOV_1 = '2026-11-01';
		const read = rule('atLeast', 'month', 'times', 10);
		expect(progressText(read, span, counts({ '2026-10-02': 4 }), '2026-10-31', NOV_1)).toBe(
			'6 more · last month'
		);
		// Oct 26–31 is the card's last (clipped) week.
		const gym = rule('atLeast', 'week', 'days', 3);
		expect(progressText(gym, span, counts({}), '2026-10-31', NOV_1)).toBe('3 more · last month');
	});

	it('limits read as slips against the limit', () => {
		expect(progressText(rule('atMost', 'day', 'times', 1), span, counts({}), TODAY, TODAY)).toBe(
			'0 of 1 today'
		);
		expect(
			progressText(rule('atMost', 'week', 'times', 2), span, counts({ [TODAY]: 1 }), TODAY, TODAY)
		).toBe('1 of 2 this week');
		expect(
			progressText(
				rule('atMost', 'month', 'days', 3),
				span,
				counts({ '2026-10-02': 2 }),
				TODAY,
				TODAY
			)
		).toBe('1 of 3 this month');
	});
});

describe('todayRows', () => {
	const walk = {
		id: 'sq-walk',
		isCenter: false as const,
		icon: 'person-simple-walk' as const,
		name: 'Walk',
		...rule('atLeast', 'day', 'times', 2)
	};
	const read = {
		id: 'sq-read',
		isCenter: false as const,
		icon: 'book-open' as const,
		name: 'Read',
		...rule('atLeast', 'month', 'days', 4)
	};
	const card = { ...span, squares: [walk, { id: 'sq-free', isCenter: true as const }, read] };

	it('puts each habit square in its section with how it looks now, after a log and after an undo', () => {
		const checkIns = new Map([['sq-walk', counts({ [TODAY]: 1 })]]);
		const sections = todayRows(card, checkIns, TODAY, TODAY, 20);
		expect(sections.thisWeek).toEqual([]);
		expect(sections.doToday).toHaveLength(1);
		const row = sections.doToday[0];
		expect(row).toMatchObject({
			squareId: 'sq-walk',
			icon: 'person-simple-walk',
			name: 'Walk',
			count: 1
		});
		expect(row.text).toBe(progressText(walk, span, counts({ [TODAY]: 1 }), TODAY, TODAY));
		expect(row.ifLogged.count).toBe(2);
		expect(row.ifUndone?.count).toBe(0);
		expect(sections.anytime.map((r) => r.squareId)).toEqual(['sq-read']);
		expect(sections.anytime[0].ifUndone).toBeNull();
	});

	it('caps the logged count', () => {
		const checkIns = new Map([['sq-walk', counts({ [TODAY]: 20 })]]);
		expect(todayRows(card, checkIns, TODAY, TODAY, 20).done[0].ifLogged.count).toBe(20);
	});
});

describe('nudgeSquares', () => {
	it('pairs each card square with its board view and counts', () => {
		const walk = { id: 'sq-walk', isCenter: false as const, ...rule('atLeast', 'day', 'times', 2) };
		const free = { id: 'sq-free', isCenter: true as const };
		const walkCounts = counts({ [TODAY]: 1 });
		const board = [
			{ name: 'Walk', state: 'inProgress' as const, counting: false },
			{ name: 'Free', state: 'free' as const, counting: true }
		];
		expect(nudgeSquares([walk, free], board, new Map([['sq-walk', walkCounts]]))).toEqual([
			{
				id: 'sq-walk',
				name: 'Walk',
				state: 'inProgress',
				counting: false,
				rule: walk,
				counts: walkCounts
			},
			{ id: null, name: 'Free', state: 'free', counting: true, rule: null, counts: new Map() }
		]);
	});
});
