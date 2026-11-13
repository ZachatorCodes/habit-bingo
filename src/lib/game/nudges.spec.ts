import { describe, expect, it } from 'vitest';
import type { CardSpan, Counts } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';
import { nudges, type NudgeSquare } from './nudges.ts';
import { counts as countsNow, type SquareState } from './square-state.ts';

const span: CardSpan = { startDate: '2026-10-01', weekStartsOn: 'monday' };
const rewards = { sixty: 'Movie night', blackout: 'A weekend away' };
const days = (entries: Record<string, number>): Counts => new Map(Object.entries(entries));
const rule = (
	period: HabitRule['period'],
	countMode: HabitRule['countMode'],
	target: number,
	direction: HabitRule['direction'] = 'atLeast'
): HabitRule => ({ direction, period, countMode, target });

const square = (
	id: string,
	state: SquareState,
	habit: HabitRule = rule('month', 'days', 1),
	counts: Counts = days({}),
	counting = countsNow(state)
): NudgeSquare => ({ id, name: id, state, rule: habit, counts, counting });
const center = (state: SquareState = 'complete'): NudgeSquare => ({
	id: null,
	name: 'Center',
	state,
	rule: null,
	counts: days({}),
	counting: countsNow(state)
});

/** A 3×3 board (center at 4) from 8 habit squares. */
const board = (squares: NudgeSquare[], middle = center()) => [
	...squares.slice(0, 4),
	middle,
	...squares.slice(4)
];
const empty = (n: number, from = 0) =>
	Array.from({ length: n }, (_, i) => square(`e${from + i}`, 'empty'));

const run = (squares: NudgeSquare[], today = '2026-10-24') =>
	nudges({ size: 3, span, today, squares, rewards, nextMonthName: 'November' });

describe('nudges', () => {
	it('none on a quiet card', () => {
		expect(run(board(empty(8)), '2026-10-20')).toEqual([]);
	});

	it('an at-risk square says what keeps it, in the habit sheet’s words', () => {
		// Saturday Oct 24 with 1 of 3 this week: 2 more by Sunday.
		const gym = square('Meditate', 'atRisk', rule('week', 'days', 3), days({ '2026-10-19': 1 }));
		// A center that doesn't count keeps the line nudges out of the way.
		expect(run(board([gym, ...empty(7)], center('buildNext')))).toEqual([
			{ text: 'Meditate: 2 more by Sunday', to: { kind: 'sheet', squareId: 'Meditate' } }
		]);
	});

	it('a missed day still in the window is a backfill reminder, newest first', () => {
		const water = square('Water', 'atRisk', rule('day', 'times', 1), days({ '2026-10-24': 1 }));
		expect(run(board([water, ...empty(7)], center('buildNext')))).toEqual([
			{
				text: "You didn't log Water yesterday: still time",
				to: { kind: 'day', date: '2026-10-23' }
			}
		]);
		const yesterdayDone = square(
			'Water',
			'atRisk',
			rule('day', 'times', 1),
			days({ '2026-10-24': 1, '2026-10-23': 1, '2026-10-22': 1 })
		);
		expect(run(board([yesterdayDone, ...empty(7)], center('buildNext')))[0].text).toBe(
			"You didn't log Water on Wednesday: still time"
		);
		// Limits and met days give no reminder.
		const allDone = square(
			'Water',
			'held',
			rule('day', 'times', 1),
			days({ '2026-10-21': 1, '2026-10-22': 1, '2026-10-23': 1 })
		);
		expect(run(board([allDone, ...empty(7)], center('buildNext')))).toEqual([]);
		const slip = square('Candy', 'held', rule('day', 'times', 1, 'atMost'));
		expect(run(board([slip, ...empty(7)], center('buildNext')))).toEqual([]);
	});

	it('one square from a bingo, only before the first one', () => {
		const near = board([square('a', 'complete'), square('b', 'held'), ...empty(6)]);
		expect(run(near, '2026-10-20')[0]).toEqual({
			text: '1 square from a bingo',
			to: { kind: 'card' }
		});
		const won = board([
			square('a', 'complete'),
			square('b', 'complete'),
			square('c', 'complete'),
			...empty(5)
		]);
		expect(run(won, '2026-10-20').map((n) => n.text)).not.toContain('1 square from a bingo');
	});

	it('within 2 squares of a reward tier names the reward, in the last 7 days', () => {
		// The center plus 2 counting: 3 of the 5 needed.
		const three = board([
			square('a', 'complete'),
			...empty(5),
			square('b', 'held'),
			square('c', 'empty')
		]);
		// Before the last week every held square is untested, so "close" means nothing yet.
		expect(run(three, '2026-10-24').map((n) => n.text)).not.toContain('2 squares from Movie night');
		// Oct 25 opens the last 7 days of October.
		expect(run(three, '2026-10-25')).toContainEqual({
			text: '2 squares from Movie night',
			to: { kind: 'card' }
		});
		// 8 counting: 1 from blackout (5 squares already reached).
		const eight = board([
			...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => square(id, 'complete')),
			square('h', 'empty')
		]);
		expect(run(eight, '2026-10-27')).toContainEqual({
			text: '1 square from A weekend away',
			to: { kind: 'card' }
		});
	});

	it('the next month nudge counts the days left', () => {
		// Oct 27–31 is 5 days.
		expect(run(board(empty(8), center('buildNext')), '2026-10-27')).toEqual([
			{
				text: "Build November's card to keep your center square: 5 days left",
				to: { kind: 'next' }
			}
		]);
		expect(run(board(empty(8), center('buildNext')), '2026-10-31')[0].text).toBe(
			"Build November's card to keep your center square: 1 day left"
		);
	});

	it('on-track squares that count at month end make a "keep it up" bingo nudge', () => {
		const limit = rule('month', 'days', 3, 'atMost');
		const pending = (id: string) => square(id, 'held', limit, days({}), false);
		const near = board([pending('a'), pending('b'), ...empty(6)]);
		expect(run(near, '2026-10-20')).toContainEqual({
			text: 'Keep it up: 1 square from a bingo by month end',
			to: { kind: 'card' }
		});
		// A lost or unstarted square is not on track.
		const off = board(
			[pending('a'), square('b', 'lost', limit, days({}), false), ...empty(6)],
			center('buildNext')
		);
		expect(run(off, '2026-10-20').map((n) => n.text)).not.toContain(
			'Keep it up: 1 square from a bingo by month end'
		);
	});

	it('the reward nudge counts on-track squares in the last week', () => {
		const gym = rule('week', 'days', 1);
		const onTrack = (id: string) => square(id, 'held', gym, days({}), false);
		// The center, one goal and two held weekly habits: 4 of the 5 needed.
		const four = board([square('a', 'complete'), onTrack('b'), onTrack('c'), ...empty(5)]);
		expect(run(four, '2026-10-25')).toContainEqual({
			text: '1 square from Movie night',
			to: { kind: 'card' }
		});
		// On track for 5, though only 2 count yet.
		const five = board([square('a', 'complete'), ...['b', 'c', 'd'].map(onTrack), ...empty(4)]);
		expect(run(five, '2026-10-25')).toContainEqual({
			text: 'On track for Movie night',
			to: { kind: 'card' }
		});
	});

	it('shows at most 3, most urgent first', () => {
		const water = square('Water', 'atRisk', rule('day', 'times', 1), days({ '2026-10-27': 1 }));
		const gym = square('Gym', 'atRisk', rule('week', 'days', 4), days({}));
		const squares = board([water, gym, square('a', 'complete'), ...empty(5)], center('buildNext'));
		expect(run(squares, '2026-10-27').map((n) => n.to.kind)).toEqual(['sheet', 'day', 'card']);
	});
});
