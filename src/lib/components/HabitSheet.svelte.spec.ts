import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HabitSheet, { type SheetData } from './HabitSheet.svelte';

const data: SheetData = {
	id: 'sq-1',
	icon: 'drop',
	name: 'Drink water',
	category: 'Health',
	rule: '8 times a day',
	countMode: 'times',
	period: 'day',
	state: 'atRisk',
	progress: 0,
	counting: true,
	stateText: 'At risk: log a missed day',
	progressText: '3/8 today',
	today: '2026-10-20',
	day: '2026-10-20',
	count: 3,
	calendar: {
		month: '2026-10',
		weekStartsOn: 'monday',
		direction: 'atLeast',
		days: {
			'2026-10-19': { count: 0, loggable: true },
			'2026-10-20': { count: 3, loggable: true },
			'2026-10-21': { count: 0, loggable: false }
		}
	}
};

describe('HabitSheet', () => {
	it('says an "at most" square counts at the end of the month', async () => {
		const limit = {
			...data,
			state: 'held' as const,
			calendar: { ...data.calendar, direction: 'atMost' as const }
		};
		const note = 'Counts at the end of the month if you stay under.';
		const { unmount } = render(HabitSheet, { data: { ...limit, counting: false } });
		await expect.element(page.getByText(note)).toBeVisible();
		unmount();
		render(HabitSheet, { data: { ...limit, counting: true } });
		expect(page.getByText(note).elements()).toHaveLength(0);
	});

	it('says a daily or weekly square counts at the end of the month', async () => {
		const note = 'Counts at the end of the month if you keep it up.';
		const daily = { ...data, state: 'held' as const };
		const first = render(HabitSheet, { data: { ...daily, counting: false } });
		await expect.element(page.getByText(note)).toBeVisible();
		first.unmount();
		const second = render(HabitSheet, { data: { ...daily, counting: true } });
		expect(page.getByText(note).elements()).toHaveLength(0);
		second.unmount();
		render(HabitSheet, { data: { ...daily, period: 'month' as const, counting: false } });
		expect(page.getByText(note).elements()).toHaveLength(0);
	});

	it('shows a stepper for times habits', async () => {
		render(HabitSheet, { data });
		await expect.element(page.getByText('Health · 8 times a day')).toBeVisible();
		await expect.element(page.getByText('At risk: log a missed day')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Add one' })).toBeVisible();
		await expect.element(page.getByRole('status', { name: 'Count' })).toHaveTextContent('3');
		expect(page.getByRole('button', { name: 'Done that day' }).elements()).toHaveLength(0);
		await expect
			.element(page.getByRole('heading', { name: 'Tuesday, Oct 20: 3 logged' }))
			.toBeVisible();
	});

	it('shows a toggle for days habits', async () => {
		render(HabitSheet, { data: { ...data, countMode: 'days', count: 0 } });
		const toggle = page.getByRole('button', { name: 'Done that day' });
		await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(page.getByRole('button', { name: 'Add one' }).elements()).toHaveLength(0);
	});

	it('marks the selected day in the calendar', async () => {
		render(HabitSheet, {
			data: { ...data, day: '2026-10-19', count: 0 },
			onnavigate: async () => {}
		});
		await expect
			.element(page.getByRole('button', { name: 'Monday October 19, not logged' }))
			.toHaveAttribute('aria-current', 'date');
		await expect
			.element(page.getByRole('button', { name: "Wednesday October 21, can't log" }))
			.toBeDisabled();
	});
});
