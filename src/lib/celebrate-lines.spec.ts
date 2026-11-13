import { describe, expect, it } from 'vitest';
import { newlyCompleted } from './celebrate-lines.ts';
import type { CardScore } from '#lib/game/score.ts';

const score = (lines: number[][], tiers: CardScore['tiers'] = []): CardScore => ({
	counting: 0,
	percent: 0,
	lines,
	tiers
});

describe('newlyCompleted', () => {
	it('finds lines and tiers that are new', () => {
		const before = score([[0, 1, 2]], ['bingo']);
		const after = score(
			[
				[0, 1, 2],
				[0, 4, 8]
			],
			['bingo', 'sixtyPercent']
		);
		expect(newlyCompleted(before, after)).toEqual({ lines: [[0, 4, 8]], tiers: ['sixtyPercent'] });
	});

	it('ignores drops and unchanged scores (Review Focus 2)', () => {
		const full = score(
			[
				[0, 1, 2],
				[3, 4, 5]
			],
			['bingo', 'blackout']
		);
		expect(newlyCompleted(full, score([[0, 1, 2]], ['bingo']))).toEqual({ lines: [], tiers: [] });
		expect(newlyCompleted(full, full)).toEqual({ lines: [], tiers: [] });
	});
});
