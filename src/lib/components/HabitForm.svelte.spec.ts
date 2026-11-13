import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { HabitInput } from '#lib/game/types.ts';
import HabitForm from './HabitForm.svelte';

const defaults: HabitInput = {
	icon: '',
	name: '',
	category: 'other',
	direction: 'atLeast',
	period: 'week',
	countMode: 'days',
	target: 3,
	isPrivate: false
};

const periodSelect = () => page.getByRole('combobox', { name: 'Per' });
const countSelect = () => page.getByRole('combobox', { name: 'Counting' });

describe('HabitForm', () => {
	it('offers "a day" for limits too, and keeps a per-day habit per day', async () => {
		render(HabitForm, {
			values: { ...defaults, period: 'day', target: 1 },
			submitLabel: 'Add habit'
		});
		await page.getByRole('radio', { name: /Limit it/ }).click();
		await expect.element(page.getByRole('option', { name: 'a day' })).toBeInTheDocument();
		await expect.element(periodSelect()).toHaveValue('day');
		await expect
			.element(page.getByRole('region', { name: 'Preview' }))
			.toHaveTextContent(/At most once a day/);
	});

	it('hides the count mode for per-day habits', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		await expect.element(countSelect()).toBeInTheDocument();
		await userEvent.selectOptions(periodSelect(), 'day');
		await expect.element(countSelect()).not.toBeInTheDocument();
	});

	it('switching to Limit it defaults the count mode to times', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		await expect.element(countSelect()).toHaveValue('days');
		await page.getByRole('radio', { name: /Limit it/ }).click();
		await expect.element(countSelect()).toHaveValue('times');
	});

	it('keeps a count mode the person picked when switching kind', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		await userEvent.selectOptions(countSelect(), 'times');
		await page.getByRole('radio', { name: /Limit it/ }).click();
		await page.getByRole('radio', { name: /Do it/ }).click();
		await expect.element(countSelect()).toHaveValue('times');
	});

	it('previews the rule sentence and square as you type', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		await page.getByRole('radio', { name: 'Bicycle' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('Bike');
		await page.getByRole('spinbutton', { name: 'How many' }).fill('3');
		await userEvent.selectOptions(periodSelect(), 'month');
		await userEvent.selectOptions(countSelect(), 'times');
		const preview = page.getByRole('region', { name: 'Preview' });
		await expect.element(preview).toHaveTextContent('3 times a month');
		await expect.element(preview.getByRole('img', { name: /^Bike:/ })).toBeInTheDocument();
	});

	it('links field errors to inputs', async () => {
		render(HabitForm, {
			values: defaults,
			errors: {
				name: 'Give it a name (up to 40 characters).',
				target: 'Pick a number from 1 to 7.'
			},
			submitLabel: 'Add habit'
		});
		const name = page.getByRole('textbox', { name: 'Name' });
		await expect.element(name).toHaveAttribute('aria-invalid', 'true');
		await expect.element(name).toHaveAccessibleDescription(/Give it a name/);
		const target = page.getByRole('spinbutton', { name: 'How many' });
		await expect.element(target).toHaveAttribute('aria-invalid', 'true');
		await expect.element(target).toHaveAccessibleDescription(/Pick a number from 1 to 7\./);
	});

	it('puts Category first, then the name and icon picker', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		const category = page.getByRole('group', { name: 'Category' }).element();
		const name = page.getByRole('textbox', { name: 'Name' }).element();
		const icons = page.getByRole('radiogroup', { name: 'Icon' }).element();
		const before = (a: Element, b: Element) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(before(category, name)).toBe(true);
		expect(before(name, icons)).toBe(true);
	});

	it('selects the category icon until one is picked', async () => {
		render(HabitForm, { values: defaults, submitLabel: 'Add habit' });
		await expect.element(page.getByRole('radio', { name: 'Sparkle' })).toBeChecked();
		await page.getByRole('radio', { name: /Fitness/ }).click();
		await expect.element(page.getByRole('radio', { name: 'Barbell' })).toBeChecked();
		await page.getByRole('radio', { name: 'Cat' }).click();
		await page.getByRole('radio', { name: /Health/ }).click();
		await expect.element(page.getByRole('radio', { name: 'Cat' })).toBeChecked();
	});
});
