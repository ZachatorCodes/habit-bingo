import { describe, expect, it } from 'vitest';
import { flyOrFade } from './motion';

describe('flyOrFade', () => {
	it('flies in from the given offset normally', () => {
		expect(flyOrFade(24, false)).toEqual({ y: 24, duration: 200 });
	});

	it('only fades when reduced motion is preferred (spec §4.7)', () => {
		expect(flyOrFade(24, true)).toEqual({ y: 0, duration: 200 });
	});
});
