import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MonthCalendar from './MonthCalendar.svelte';

const base = {
	month: '2026-10',
	weekStartsOn: 'monday' as const,
	today: '2026-10-24',
	selected: '2026-10-24',
	days: {
		'2026-10-22': { count: 1, loggable: true },
		'2026-10-23': { count: 0, loggable: true },
		'2026-10-29': { count: 0, loggable: true },
		'2026-10-30': { count: 0, loggable: false }
	},
	direction: 'atLeast' as const
};

describe('MonthCalendar', () => {
	it('is a grid with named day cells', async () => {
		render(MonthCalendar, base);
		await expect.element(page.getByRole('grid')).toBeInTheDocument();
		await expect
			.element(page.getByRole('gridcell', { name: 'Thursday October 22, 1 logged' }))
			.toBeInTheDocument();
	});

	it('names and disables a day that cannot be logged', async () => {
		render(MonthCalendar, base);
		const cell = page.getByRole('button', { name: "Friday October 30, can't log" });
		await expect.element(cell).toBeDisabled();
	});

	it('moves focus with arrow keys', async () => {
		render(MonthCalendar, base);
		page
			.getByRole('button', { name: /October 22,/ })
			.element()
			.focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-23');
		page
			.getByRole('button', { name: /October 22,/ })
			.element()
			.focus();
		await userEvent.keyboard('{ArrowDown}');
		expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-29');
	});

	it('calls onselect for a loggable day', async () => {
		const onselect = vi.fn();
		render(MonthCalendar, { ...base, onselect });
		await page.getByRole('button', { name: /October 22,/ }).click();
		expect(onselect).toHaveBeenCalledWith('2026-10-22');
	});

	it('renders links when href is given', async () => {
		render(MonthCalendar, { ...base, href: (d: string) => `/habits/x?day=${d}` });
		await expect
			.element(page.getByRole('link', { name: /October 22,/ }))
			.toHaveAttribute('href', '/habits/x?day=2026-10-22');
	});

	it('marks a logged at-most day as a slip', async () => {
		render(MonthCalendar, { ...base, direction: 'atMost' });
		await expect
			.element(page.getByRole('button', { name: /October 22,/ }))
			.toHaveAttribute('data-slip');
	});
});
