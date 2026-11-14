import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Habit } from '#lib/game/types.ts';
import TargetList from './TargetList.svelte';

function habit(id: string, name: string, over: Partial<Habit> = {}): Habit {
	return {
		id,
		icon: 'bicycle',
		name,
		category: 'fitness',
		direction: 'atLeast',
		period: 'month',
		countMode: 'times',
		target: 10,
		isPrivate: false,
		archivedAt: null,
		...over
	};
}

const rows = [
	{ habit: habit('a', 'Bike'), prorated: 5, value: 5, range: { min: 1, max: 100 } },
	{
		habit: habit('b', 'Stretch', { period: 'day', target: 1 }),
		prorated: 1,
		value: 1,
		range: { min: 1, max: 20 }
	},
	{
		habit: habit('c', 'Run', { period: 'week', target: 3 }),
		prorated: 3,
		value: 3,
		range: { min: 1, max: 50 }
	}
];

const props = { rows, daysLeft: 13, monthName: 'October', startDate: '2026-10-19', errors: {} };

describe('TargetList', () => {
	it("explains the days left and each row's proration", async () => {
		render(TargetList, props);
		await expect.element(page.getByText('13 days left in October')).toBeInTheDocument();
		await expect.element(page.getByText('Prorated from 10')).toBeInTheDocument();
		await expect.element(page.getByText('Every day from October 19')).toBeInTheDocument();
		await expect.element(page.getByText('3 a week (short weeks scale down)')).toBeInTheDocument();
		const input = page.getByRole('spinbutton', { name: 'Bike' });
		await expect.element(input).toHaveAttribute('name', 'target:a');
		await expect.element(input).toHaveValue(5);
	});

	it('does not claim proration when the target is unchanged', async () => {
		render(TargetList, {
			...props,
			rows: [{ ...rows[0], prorated: 10, value: 10 }]
		});
		expect(page.getByText(/Prorated from/).elements()).toHaveLength(0);
	});

	it('says "1 day left" on the last day', async () => {
		render(TargetList, { ...props, daysLeft: 1 });
		await expect.element(page.getByText('1 day left in October')).toBeInTheDocument();
	});

	it('links each error to its input', async () => {
		render(TargetList, {
			...props,
			errors: { 'target:a': 'Pick a number from 1 to 100.' }
		});
		const input = page.getByRole('spinbutton', { name: 'Bike' });
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(input).toHaveAccessibleDescription(/Pick a number from 1 to 100\./);
	});
});
