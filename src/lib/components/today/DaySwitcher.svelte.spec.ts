import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DaySwitcher from './DaySwitcher.svelte';

const days = ['2026-10-20', '2026-10-19', '2026-10-18', '2026-10-17'];

describe('DaySwitcher', () => {
	it('labels today, yesterday and weekdays and marks the selected day', async () => {
		render(DaySwitcher, { days, selected: '2026-10-18', today: '2026-10-20' });
		const nav = page.getByRole('navigation', { name: 'Day' });
		expect(
			nav
				.getByRole('link')
				.elements()
				.map((a) => a.textContent?.trim())
		).toEqual(['Today', 'Yesterday', 'Sunday', 'Saturday']);
		await expect
			.element(nav.getByRole('link', { name: 'Sunday' }))
			.toHaveAttribute('aria-current', 'date');
		await expect
			.element(nav.getByRole('link', { name: 'Today' }))
			.toHaveAttribute('href', '/today');
		await expect
			.element(nav.getByRole('link', { name: 'Yesterday' }))
			.toHaveAttribute('href', '/today?day=2026-10-19');
	});
});
