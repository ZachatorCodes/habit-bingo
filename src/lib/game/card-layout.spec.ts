import { describe, expect, it } from 'vitest';
import { CARD_SIZES, isCardSize, isValidLayout, middleReward, shuffleLayout } from './card-layout';

const items = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`);

/** Deterministic pseudo-random sequence. */
function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

describe('card sizes', () => {
	it('sizes match the spec', () => {
		expect(CARD_SIZES).toEqual({
			3: { habits: 8, squares: 9, sixtyThreshold: 5, centerPosition: 4 },
			5: { habits: 24, squares: 25, sixtyThreshold: 12, centerPosition: 12 }
		});
		expect(isCardSize(3)).toBe(true);
		expect(isCardSize(5)).toBe(true);
		expect(isCardSize(4)).toBe(false);
		expect(isCardSize('5')).toBe(false);
	});
});

describe('middleReward', () => {
	it('is 5 and 12 squares, but 15 on 5×5 months finished before the points rework', () => {
		expect(middleReward(3, '2026-10')).toBe(5);
		expect(middleReward(5, '2026-10')).toBe(15);
		expect(middleReward(5, '2026-11')).toBe(12);
		expect(middleReward(3, '2026-11')).toBe(5);
	});
});

describe('shuffleLayout', () => {
	it('shuffles every item exactly once, deterministically for a given random', () => {
		const a = shuffleLayout(items(8), 3, seeded(1));
		const b = shuffleLayout(items(8), 3, seeded(1));
		expect(a).toEqual(b);
		expect(a.filter((x) => x !== null).sort()).toEqual(items(8).sort());
		expect(a.filter((x) => x !== null)).not.toEqual(items(8));
	});

	it('does not mutate its input', () => {
		const input = items(8);
		shuffleLayout(input, 3, seeded(2));
		expect(input).toEqual(items(8));
	});

	it('puts the center (null) at index 4 on 3x3 and 12 on 5x5', () => {
		const five = shuffleLayout(items(24), 5, seeded(3));
		expect(five).toHaveLength(25);
		expect(five[12]).toBeNull();
		expect(five.filter((x) => x === null)).toHaveLength(1);
		expect(five.filter((x) => x !== null).sort()).toEqual(items(24).sort());
		const three = shuffleLayout(items(8), 3, seeded(3));
		expect(three).toHaveLength(9);
		expect(three[4]).toBeNull();
		expect(three.filter((x) => x === null)).toHaveLength(1);
	});

	it('refuses the wrong number of items', () => {
		expect(() => shuffleLayout(items(9), 3, Math.random)).toThrow(RangeError);
		expect(() => shuffleLayout(items(25), 5, Math.random)).toThrow(RangeError);
	});
});

describe('isValidLayout', () => {
	it('accepts a shuffle', () => {
		expect(isValidLayout(shuffleLayout(items(8), 3, seeded(4)), items(8), 3)).toBe(true);
		expect(isValidLayout(shuffleLayout(items(24), 5, seeded(4)), items(24), 5)).toBe(true);
	});

	it('rejects bad layouts', () => {
		const three = shuffleLayout(items(8), 3, seeded(5));
		const five = shuffleLayout(items(24), 5, seeded(5));
		expect(isValidLayout(three.slice(1), items(8), 3)).toBe(false);
		expect(isValidLayout(three, items(9), 3)).toBe(false);
		const duplicate = [...three];
		duplicate[three[0] === null ? 1 : 0] = three[three[0] === null ? 2 : 1];
		expect(isValidLayout(duplicate, items(8), 3)).toBe(false);
		const foreign = [...three];
		foreign[0] = 'other';
		expect(isValidLayout(foreign, items(8), 3)).toBe(false);
		const offCenter = [...five];
		[offCenter[12], offCenter[0]] = [offCenter[0], offCenter[12]];
		expect(isValidLayout(offCenter, items(24), 5)).toBe(false);
		const noNull = [...five];
		noNull[12] = 'h0';
		expect(isValidLayout(noNull, items(24), 5)).toBe(false);
		const offCenter3 = [...three];
		[offCenter3[4], offCenter3[0]] = [offCenter3[0], offCenter3[4]];
		expect(isValidLayout(offCenter3, items(8), 3)).toBe(false);
	});
});
