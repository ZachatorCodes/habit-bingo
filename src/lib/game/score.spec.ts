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
	squarePoints,
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

describe('squarePoints', () => {
	const TODAY = '2026-10-20';

	it('earn points are proportional and capped', () => {
		const read = rule('atLeast', 'month', 'days', 4);
		const two = days({ '2026-10-02': 1, '2026-10-03': 1 });
		expect(squarePoints(read, span, two, TODAY, 'inProgress')).toBe(5);
		const six = days(
			Object.fromEntries(['01', '02', '03', '04', '05', '06'].map((d) => [`2026-10-${d}`, 1]))
		);
		expect(squarePoints(read, span, six, TODAY, 'complete')).toBe(10);
	});

	it('atLeast / day points over the whole span', () => {
		const walk = rule('atLeast', 'day', 'times', 2);
		// 10 days fully met (2 each) and one day half met, of 31 days × N = 2.
		const met: Record<string, number> = {};
		for (let d = 1; d <= 10; d++) met[`2026-10-${String(d).padStart(2, '0')}`] = 2;
		met['2026-10-11'] = 1;
		met['2026-10-12'] = 5; // capped at N
		expect(squarePoints(walk, span, days(met), TODAY, 'lost')).toBeCloseTo((10 * 23) / 62);
	});

	it('atLeast / week points over clipped weeks, and 10 when nothing is required', () => {
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
		expect(squarePoints(gym, span, counted, TODAY, 'atRisk')).toBeCloseTo((10 * 5) / 14);
		const stub: CardSpan = { startDate: '2026-10-31', weekStartsOn: 'monday' };
		expect(
			squarePoints(rule('atLeast', 'week', 'times', 1), stub, days({}), '2026-10-31', 'held')
		).toBe(10);
	});

	it('a limit of 0 pays for each finished clean day', () => {
		const none = rule('atMost', 'month', 'days', 0);
		expect(squarePoints(none, span, days({}), '2026-10-15', 'held')).toBeCloseTo((10 * 14) / 31);
		expect(squarePoints(none, span, days({}), '2026-11-01', 'held')).toBe(10);
		expect(squarePoints(none, span, days({}), '2026-11-20', 'held')).toBe(10);
	});

	it('a slip day pays nothing; the clean days are kept', () => {
		const none = rule('atMost', 'month', 'days', 0);
		const slip = days({ '2026-10-21': 1 });
		expect(squarePoints(none, span, slip, '2026-11-01', 'lost')).toBeCloseTo((10 * 30) / 31);
	});

	it('a daily limit pays for each finished day within it', () => {
		const coffee = rule('atMost', 'day', 'times', 2);
		const log = days({ '2026-10-01': 3, '2026-10-02': 2 });
		expect(squarePoints(coffee, span, log, '2026-10-03', 'lost')).toBeCloseTo(10 / 31);
	});

	it('a weekly limit of 0 pays per clean day too', () => {
		const none = rule('atMost', 'week', 'days', 0);
		expect(squarePoints(none, span, days({ '2026-10-02': 1 }), '2026-10-04', 'lost')).toBeCloseTo(
			(10 * 2) / 31
		);
	});

	it('a card started late pays over its own days', () => {
		const none = rule('atMost', 'month', 'days', 0);
		const late: CardSpan = { startDate: '2026-10-20', weekStartsOn: 'monday' };
		expect(squarePoints(none, late, days({}), '2026-10-25', 'held')).toBeCloseTo((10 * 5) / 12);
		expect(squarePoints(none, late, days({}), '2026-11-01', 'held')).toBe(10);
	});

	it('atMost squares are worth 10 once the month is over, unless lost', () => {
		const naps = rule('atMost', 'month', 'days', 3);
		expect(squarePoints(naps, span, days({}), TODAY, 'held')).toBe(0);
		expect(squarePoints(naps, span, days({}), '2026-10-31', 'held')).toBe(0);
		expect(squarePoints(naps, span, days({}), '2026-11-01', 'held')).toBe(10);
		expect(squarePoints(naps, span, days({}), '2026-11-01', 'atRisk')).toBe(10);
		expect(squarePoints(naps, span, days({}), '2026-11-01', 'lost')).toBe(0);
	});
});

describe('scoreCard', () => {
	const square = (state: SquareState, points = 10, counting = counts(state)) => ({
		state,
		points,
		counting
	});

	it('squares that do not count yet make no lines or tiers', () => {
		const pending = [...Array(4)].map(() => square('held', 0, false));
		const card = [...pending, square('free', 0), ...pending];
		expect(scoreCard(3, card)).toMatchObject({ counting: 1, lines: [], tiers: [], points: 0 });
	});

	it('blackout totals match the spec examples', () => {
		const three = [...Array(4)].map(() => square('complete'));
		const card3 = [...three, square('complete', 0), ...three];
		expect(scoreCard(3, card3)).toMatchObject({ counting: 9, percent: 100, points: 380 });
		const twelve = [...Array(12)].map(() => square('held'));
		const card5 = [...twelve, square('complete', 0), ...twelve];
		expect(scoreCard(5, card5)).toMatchObject({
			points: 640,
			tiers: ['bingo', 'sixtyPercent', 'blackout']
		});
	});

	it('rounds once at the end', () => {
		const card = [
			square('inProgress', 3.4),
			square('inProgress', 3.4),
			...[...Array(7)].map(() => square('empty', 0))
		];
		expect(scoreCard(3, card)).toMatchObject({
			counting: 0,
			percent: 9,
			lines: [],
			tiers: [],
			points: 7
		});
	});

	it('percent is progress: habit square points out of 10, averaged', () => {
		const card = [
			...[...Array(4)].map(() => square('complete', 10)),
			square('free', 0),
			...[...Array(4)].map(() => square('inProgress', 5))
		];
		expect(scoreCard(3, card).percent).toBe(75);
		const third = [square('inProgress', 10 / 3), ...[...Array(8)].map(() => square('empty', 0))];
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
