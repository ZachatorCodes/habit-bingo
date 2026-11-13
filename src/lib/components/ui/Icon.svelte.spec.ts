import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Icon from './Icon.svelte';

describe('Icon', () => {
	it('renders the named icon, hidden from assistive tech', async () => {
		const { container } = render(Icon, { name: 'book-open' });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		const other = render(Icon, { name: 'drop' }).container.innerHTML;
		expect(container.innerHTML).not.toBe(other);
	});
	it('falls back to sparkle for an unknown name', async () => {
		const unknown = render(Icon, { name: 'not-an-icon' }).container.innerHTML;
		const sparkle = render(Icon, { name: 'sparkle' }).container.innerHTML;
		expect(unknown).toBe(sparkle);
	});
	it('defaults to the duotone weight', async () => {
		expect(
			render(Icon, { name: 'drop' }).container.querySelector('[opacity="0.2"]')
		).not.toBeNull();
	});
});
