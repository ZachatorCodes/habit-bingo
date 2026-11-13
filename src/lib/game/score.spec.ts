import { describe, expect, it } from 'vitest';
import type { CardSpan } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';
import {
	completeLines,
	counts,
	lineIndexes,
	nextTier,
	reachedTiers,
	scoreCard,
	squareCompletion,
	squaresToLine
} from './score.ts';
import type { SquareState } from './square-state.ts';

const span: CardSpan = { startDate: '2026-10-01', weekStartsOn: 'monday' };
const days = (entries: Record<string, number>) => new Map(Object.entries(entries));
const rule = (
	direction: HabitRule['direction'],
	period: HabitRule['period'],
	countMode: HabitRule['countMode'],
	target: number
): HabitRule => ({ direction, period, countMode, target });
const all = (n: number, value = true) => Array.from({ length: n }, () => value);

describe('counts', () => {
	it('free, complete, held and atRisk count; the rest do not', () => {
		const states: SquareState[] = [
			'free',
			'empty',
			'inProgress',
			'complete',
			'held',
			'atRisk',
			'lost',
			'buildNext'
		];
		expect(states.filter(counts)).toEqual(['free', 'complete', 'held', 'atRisk']);
	});
});

describe('lines', () => {
	it('3×3 has 8 lines and 5×5 has 12', () => {
		expect(lineIndexes(3)).toHaveLength(8);
		expect(lineIndexes(5)).toHaveLength(12);
		expect(lineIndexes(3)).toContainEqual([0, 4, 8]);
		expect(lineIndexes(3)).toContainEqual([2, 4, 6]);
		expect(lineIndexes(5)).toContainEqual([0, 6, 12, 18, 24]);
	});

	it('a line is complete only when all its squares count', () => {
		const counting = all(9, false);
		for (const i of [0, 1, 2]) counting[i] = true;
		expect(completeLines(counting, 3)).toEqual([[0, 1, 2]]);
		counting[2] = false;
		expect(completeLines(counting, 3)).toEqual([]);
	});

	it('a buildNext center breaks its lines; a complete center completes them', () => {
		// Review Focus 1: the middle row, middle column and both diagonals go through the center.
		const counting = all(9);
		counting[4] = counts('buildNext');
		expect(completeLines(counting, 3)).toHaveLength(4);
		counting[4] = counts('complete');
		expect(completeLines(counting, 3)).toHaveLength(8);
	});
});

describe('reachedTiers', () => {
	it('bingo, the 5 / 12 squares tier and blackout', () => {
		expect(reachedTiers(all(9, false), 3)).toEqual([]);
		const five = [true, true, true, true, true, false, false, false, false];
		expect(reachedTiers(five, 3)).toEqual(['bingo', 'sixtyPercent']);
		const four = [false, true, false, true, true, true, false, false, false];
		expect(reachedTiers(four, 3)).toEqual(['bingo']);
		expect(reachedTiers(all(9), 3)).toEqual(['bingo', 'sixtyPercent', 'blackout']);
		const twelve = [...all(12), ...all(13, false)];
		expect(reachedTiers(twelve, 5)).toEqual(['bingo', 'sixtyPercent']);
		const eleven = [...all(11), ...all(14, false)];
		expect(reachedTiers(eleven, 5)).toEqual(['bingo']);
	});

	it('tiers drop when a square is lost', () => {
		// Review Focus 2: tiers are live.
		const counting = all(9);
		counting[8] = counts('lost');
		expect(reachedTiers(counting, 3)).toEqual(['bingo', 'sixtyPercent']);
	});
});

describe('squareCompletion', () => {
	const TODAY = '2026-10-20';

	it('monthly goals: progress over the target, capped', () => {
		const read = rule('atLeast', 'month', 'days', 4);
		const two = days({ '2026-10-02': 1, '2026-10-03': 1 });
		expect(squareCompletion(read, span, two, TODAY, 'inProgress')).toBe(0.5);
		const six = days(
			Object.fromEntries(['01', '02', '03', '04', '05', '06'].map((d) => [`2026-10-${d}`, 1]))
		);
		expect(squareCompletion(read, span, six, TODAY, 'complete')).toBe(1);
	});

	it('a perfect daily habit is 15/31 complete on Oct 15, extra logs capped', () => {
		const walk = rule('atLeast', 'day', 'times', 2);
		const met: Record<string, number> = {};
		for (let d = 1; d <= 15; d++) met[`2026-10-${String(d).padStart(2, '0')}`] = 2;
		expect(squareCompletion(walk, span, days(met), '2026-10-15', 'held')).toBeCloseTo(15 / 31);
		met['2026-10-12'] = 5;
		expect(squareCompletion(walk, span, days(met), '2026-10-15', 'held')).toBeCloseTo(15 / 31);
	});

	it('weekly habits over clipped weeks, and 1 when nothing is required', () => {
		const gym = rule('atLeast', 'week', 'days', 3);
		// Weeks of October require 2, 3, 3, 3, 3 = 14; 2 + 3 met.
		const counted = days({
			'2026-10-01': 1,
			'2026-10-02': 1,
			'2026-10-05': 1,
			'2026-10-06': 1,
			'2026-10-07': 1,
			'2026-10-08': 1
		});
		expect(squareCompletion(gym, span, counted, TODAY, 'atRisk')).toBeCloseTo(5 / 14);
		const stub: CardSpan = { startDate: '2026-10-31', weekStartsOn: 'monday' };
		expect(
			squareCompletion(rule('atLeast', 'week', 'times', 1), stub, days({}), '2026-10-31', 'held')
		).toBe(1);
	});

	it('a limit of 0 fills a share for each finished clean day', () => {
		const none = rule('atMost', 'month', 'days', 0);
		expect(squareCompletion(none, span, days({}), '2026-10-15', 'held')).toBeCloseTo(14 / 31);
		expect(squareCompletion(none, span, days({}), '2026-11-01', 'held')).toBe(1);
		expect(squareCompletion(none, span, days({}), '2026-11-20', 'held')).toBe(1);
	});

	it('a daily limit fills for each finished day within it', () => {
		const coffee = rule('atMost', 'day', 'times', 2);
		const log = days({ '2026-10-01': 3, '2026-10-02': 2 });
		expect(squareCompletion(coffee, span, log, '2026-10-03', 'atRisk')).toBeCloseTo(1 / 31);
		// Oct 3 had none: within.
		expect(squareCompletion(coffee, span, log, '2026-10-04', 'atRisk')).toBeCloseTo(2 / 31);
	});

	it('a monthly limit above 0 fills while the running total is within it', () => {
		const eatOut = rule('atMost', 'month', 'times', 3);
		const log = days({ '2026-10-02': 2, '2026-10-05': 2 });
		// Oct 1–4 are within (running total ≤ 3); from Oct 5 the total is 4.
		expect(squareCompletion(eatOut, span, log, '2026-10-10', 'held')).toBeCloseTo(4 / 31);
	});

	it("a weekly limit above 0 fills while that week's running total is within it", () => {
		const naps = rule('atMost', 'week', 'days', 1);
		// The week of Oct 5 goes over on Oct 7: Oct 1–6 are within.
		const log = days({ '2026-10-06': 1, '2026-10-07': 1 });
		expect(squareCompletion(naps, span, log, '2026-10-09', 'held')).toBeCloseTo(6 / 31);
	});

	it('a card started late counts over its own days', () => {
		const none = rule('atMost', 'month', 'days', 0);
		const late: CardSpan = { startDate: '2026-10-20', weekStartsOn: 'monday' };
		expect(squareCompletion(none, late, days({}), '2026-10-25', 'held')).toBeCloseTo(5 / 12);
		expect(squareCompletion(none, late, days({}), '2026-11-01', 'held')).toBe(1);
	});

	it('a lost square counts nothing, whatever it had', () => {
		const read = rule('atLeast', 'month', 'days', 1);
		const walk = rule('atLeast', 'day', 'times', 1);
		const none = rule('atMost', 'month', 'days', 0);
		expect(squareCompletion(walk, span, days({ '2026-10-01': 1 }), TODAY, 'lost')).toBe(0);
		expect(squareCompletion(none, span, days({ '2026-10-05': 1 }), TODAY, 'lost')).toBe(0);
		expect(squareCompletion(read, span, days({ '2026-10-01': 1 }), TODAY, 'lost')).toBe(0);
	});
});

describe('scoreCard', () => {
	const square = (state: SquareState, completion = 1, counting = counts(state)) => ({
		completion,
		counting
	});

	it('has no points; squares that do not count yet make no lines or tiers', () => {
		const pending = [...Array(4)].map(() => square('held', 0, false));
		const score = scoreCard(3, [...pending, square('free', 0), ...pending]);
		expect(score).toEqual({ counting: 1, percent: 0, lines: [], tiers: [] });
	});

	it('a full card is 100% with every line and tier', () => {
		const four = [...Array(4)].map(() => square('complete'));
		const card = [...four, square('free', 0), ...four];
		expect(scoreCard(3, card)).toMatchObject({
			counting: 9,
			percent: 100,
			tiers: ['bingo', 'sixtyPercent', 'blackout']
		});
		expect(scoreCard(3, card).lines).toHaveLength(8);
	});

	it('percent averages habit square completion, rounded once', () => {
		const card = [
			...[...Array(4)].map(() => square('complete', 1)),
			square('free', 0),
			...[...Array(4)].map(() => square('inProgress', 0.5))
		];
		expect(scoreCard(3, card).percent).toBe(75);
		const third = [square('inProgress', 1 / 3), ...[...Array(8)].map(() => square('empty', 0))];
		expect(scoreCard(3, third).percent).toBe(4);
	});
});

describe('squaresToLine', () => {
	const board = (fill: SquareState): SquareState[] => {
		const s = Array<SquareState>(9).fill(fill);
		s[4] = 'free';
		return s;
	};
	it('counts the closest line', () => {
		const s = board('empty');
		s[0] = 'complete';
		expect(squaresToLine(3, s, s.map(counts))).toBe(1); // diagonal 0-4-8 needs 1
	});
	it('works on a 5×5 board', () => {
		const s = Array<SquareState>(25).fill('empty');
		s[12] = 'free';
		s[0] = 'complete';
		expect(squaresToLine(5, s, s.map(counts))).toBe(3); // diagonal 0-6-12-18-24: free center and one complete
	});
	it('counts held and at-risk squares', () => {
		const s = board('empty');
		s[3] = 'held';
		s[5] = 'atRisk';
		expect(squaresToLine(3, s, s.map(counts))).toBe(0);
	});
	it('needs held squares that do not count yet', () => {
		const s = board('held');
		const counting = s.map((state) => state === 'free');
		expect(squaresToLine(3, s, counting)).toBe(2);
	});
	it('skips lines with a lost square', () => {
		expect(squaresToLine(3, board('lost'), board('lost').map(counts))).toBeNull();
	});
	it('is 0 when a line is complete', () => {
		const s = board('empty');
		s[3] = 'held';
		s[5] = 'complete';
		expect(squaresToLine(3, s, s.map(counts))).toBe(0);
	});
});

describe('nextTier', () => {
	it('returns the first unreached tier', () => {
		expect(nextTier([])).toBe('bingo');
		expect(nextTier(['bingo'])).toBe('sixtyPercent');
		expect(nextTier(['bingo', 'sixtyPercent', 'blackout'])).toBeNull();
	});
});
