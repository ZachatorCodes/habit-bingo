import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TodayRow from './TodayRow.svelte';

const row = {
	squareId: 'sq-1',
	icon: 'drop',
	name: 'Drink water',
	state: 'held' as const,
	progress: 0,
	text: '5/8 today',
	count: 5,
	ifLogged: { state: 'held' as const, progress: 0, text: '6/8 today', count: 6 },
	ifUndone: { state: 'held' as const, progress: 0, text: '4/8 today', count: 4 }
};

describe('TodayRow', () => {
	it('names its buttons and shows the progress text', async () => {
		render(TodayRow, { row, day: '2026-10-20', keep: '' });
		await expect.element(page.getByText('Drink water', { exact: true })).toBeVisible();
		await expect.element(page.getByText('5/8 today')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Log Drink water' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Undo one Drink water' })).toBeVisible();
		const form = page.getByRole('button', { name: 'Log Drink water' }).element().closest('form')!;
		expect(form.getAttribute('action')).toBe('?/log');
		expect(new FormData(form).get('squareId')).toBe('sq-1');
		expect(new FormData(form).get('date')).toBe('2026-10-20');
	});

	it('hides − when nothing is logged that day and keeps the day in its actions', async () => {
		render(TodayRow, { row: { ...row, count: 0 }, day: '2026-10-19', keep: '&day=2026-10-19' });
		expect(page.getByRole('button', { name: /Undo one/ }).elements()).toHaveLength(0);
		const form = page.getByRole('button', { name: 'Log Drink water' }).element().closest('form')!;
		expect(form.getAttribute('action')).toBe('?/log&day=2026-10-19');
	});
	it('replaces + with the check when the target is met', async () => {
		const done = { ...row, state: 'complete' as const, count: 8 };
		render(TodayRow, { row: done, day: '2026-10-20', keep: '' });
		await expect.element(page.getByRole('button', { name: 'Undo one Drink water' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Log Drink water' }).elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: /Undo one/ }).elements()).toHaveLength(1);
	});

	it('shows − only with a count, and + while the target is open', async () => {
		render(TodayRow, { row, day: '2026-10-20', keep: '' });
		await expect.element(page.getByRole('button', { name: 'Log Drink water' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Undo one Drink water' })).toBeVisible();
	});
});
