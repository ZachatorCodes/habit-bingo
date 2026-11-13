import { describe, expect, it } from 'vitest';
import { rankRows } from './leaderboard.ts';

const row = (displayUsername: string, percent: number | null, lines: number | null = 0) => ({
	displayUsername,
	percent,
	lines
});

describe('rankRows', () => {
	it('sorts by percent, then lines, then name, with competition ranks; no-card rows last', () => {
		const out = rankRows([
			row('b', 50, 1),
			row('a', 50, 2),
			row('d', null, null),
			row('c', 70, 0),
			row('e', 5, 0)
		]);
		expect(out.map((r) => [r.displayUsername, r.rank])).toEqual([
			['c', 1],
			['a', 2],
			['b', 3],
			['e', 4],
			['d', null]
		]);
	});

	it('equal percent and lines share a rank, ordered by name', () => {
		const out = rankRows([row('zed', 40, 1), row('amy', 40, 1), row('kim', 40, 1)]);
		expect(out.map((r) => r.displayUsername)).toEqual(['amy', 'kim', 'zed']);
		expect(out.every((r) => r.rank === 1)).toBe(true);
	});

	it('keeps input order when every row has no card', () => {
		const out = rankRows([row('b', null, null), row('a', null, null)]);
		expect(out.map((r) => [r.displayUsername, r.rank])).toEqual([
			['b', null],
			['a', null]
		]);
	});

	it('returns [] for empty input', () => {
		expect(rankRows([])).toEqual([]);
	});
});
