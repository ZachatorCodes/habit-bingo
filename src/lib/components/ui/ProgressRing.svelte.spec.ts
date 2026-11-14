import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProgressRing from './ProgressRing.svelte';

describe('ProgressRing', () => {
	it('progress draws the arc at the given percent', () => {
		const { container } = render(ProgressRing, { icon: 'drop', variant: 'progress', percent: 50 });
		expect(Number(container.querySelector('[data-arc]')!.getAttribute('data-percent'))).toBe(50);
	});

	it.each([
		[-10, 0],
		[150, 100]
	])('clamps percent %i to %i', (percent, expected) => {
		const { container } = render(ProgressRing, { icon: 'drop', variant: 'progress', percent });
		expect(Number(container.querySelector('[data-arc]')!.getAttribute('data-percent'))).toBe(
			expected
		);
	});

	it.each(['earned', 'protected', 'risk', 'lost', 'open'] as const)(
		'%s renders and is hidden from assistive tech',
		(variant) => {
			const { container } = render(ProgressRing, { icon: 'drop', variant });
			expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
			expect(container.firstElementChild!.getAttribute('data-variant')).toBe(variant);
		}
	);

	it('risk is dashed', () => {
		const { container } = render(ProgressRing, { icon: 'drop', variant: 'risk' });
		expect(container.querySelector('[data-arc]')!.getAttribute('stroke-dasharray')).toBe('6 5');
	});
});
