import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFETTI_COLORS, burst, fullScreenConfetti, tap } from './celebrate.ts';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('burst', () => {
	it('fires a small burst from the given point', async () => {
		const fire = vi.fn();
		await burst({ x: 0.5, y: 0.25 }, false, fire);
		expect(fire).toHaveBeenCalledTimes(1);
		expect(fire.mock.calls[0][0]).toMatchObject({ origin: { x: 0.5, y: 0.25 }, particleCount: 24 });
	});

	it('does nothing under reduced motion', async () => {
		const fire = vi.fn();
		await burst({ x: 0.5, y: 0.5 }, true, fire);
		expect(fire).not.toHaveBeenCalled();
	});
});

describe('tap', () => {
	it('vibrates where supported', () => {
		const vibrate = vi.fn();
		vi.stubGlobal('navigator', { vibrate });
		tap();
		expect(vibrate).toHaveBeenCalledWith(10);
	});

	it('is silent elsewhere', () => {
		vi.stubGlobal('navigator', {});
		expect(() => tap()).not.toThrow();
	});
});

describe('fullScreenConfetti', () => {
	it('fills the screen, or does nothing under reduced motion', async () => {
		const fire = vi.fn();
		await fullScreenConfetti(true, fire);
		expect(fire).not.toHaveBeenCalled();
		await fullScreenConfetti(false, fire);
		expect(fire.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(fire.mock.calls[0][0].colors).toBe(CONFETTI_COLORS);
	});
});
