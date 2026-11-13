import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Habit } from '#lib/game/types.ts';
import HabitPicker from './HabitPicker.svelte';

function habit(id: string, name: string, category: Habit['category'] = 'fitness'): Habit {
	return {
		id,
		icon: 'bicycle',
		name,
		category,
		direction: 'atLeast',
		period: 'month',
		countMode: 'times',
		target: 3,
		isPrivate: false,
		archivedAt: null
	};
}

const habits = [habit('a', 'Bike'), habit('b', 'Run'), habit('c', 'Read', 'learning')];

describe('HabitPicker', () => {
	it('groups habits by category with their rule sentences', async () => {
		render(HabitPicker, { habits, selected: [], need: 9 });
		await expect.element(page.getByRole('group', { name: /Fitness/ })).toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: /Learning/ })).toBeInTheDocument();
		expect(page.getByRole('checkbox').elements()).toHaveLength(3);
		await expect
			.element(page.getByRole('checkbox', { name: /Bike/ }))
			.toHaveAttribute('name', 'habitIds');
		await expect
			.element(page.getByRole('checkbox', { name: /Bike/ }))
			.toHaveAttribute('value', 'a');
		expect(page.getByText('3 times a month').elements()).toHaveLength(3);
	});

	it('counts picks live', async () => {
		render(HabitPicker, { habits, selected: ['a', 'b'], need: 9 });
		const counter = page.getByText(/of 9 picked/);
		await expect.element(counter).toHaveTextContent('2 of 9 picked');
		await expect.element(counter).toHaveAttribute('aria-live', 'polite');
		await page.getByRole('checkbox', { name: /Read/ }).click();
		await expect.element(counter).toHaveTextContent('3 of 9 picked');
		await page.getByRole('checkbox', { name: /Bike/ }).click();
		await expect.element(counter).toHaveTextContent('2 of 9 picked');
	});

	it('describes the habit group by its error', async () => {
		render(HabitPicker, { habits, selected: [], need: 9, errorId: 'problem' });
		const group = page.getByRole('group', { name: 'Your habits' });
		await expect.element(group).toHaveAttribute('aria-describedby', 'problem');
	});
});
