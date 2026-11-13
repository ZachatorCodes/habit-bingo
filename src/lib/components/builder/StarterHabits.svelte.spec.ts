import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StarterHabits from './StarterHabits.svelte';

describe('StarterHabits', () => {
	it('lists every starter with its rule sentence', async () => {
		render(StarterHabits, { addedIds: [] });
		await expect.element(page.getByRole('heading', { name: 'Quick start' })).toBeInTheDocument();
		await expect
			.element(page.getByText('Tap to add. You can change them later.'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add Go biking' })).toBeEnabled();
		await expect.element(page.getByText('At most 10 times a month')).toBeInTheDocument();
		expect(page.getByRole('button', { name: /^Add / }).elements()).toHaveLength(10);
	});

	it('marks added starters and disables them', async () => {
		render(StarterHabits, { addedIds: ['bike'] });
		const bike = page.getByRole('button', { name: 'Go biking added' });
		await expect.element(bike).toBeDisabled();
		await expect.element(bike).toHaveTextContent('Added');
		await expect.element(page.getByRole('button', { name: 'Add Meditate' })).toBeEnabled();
	});

	it('posts the starter id to addStarter', async () => {
		render(StarterHabits, { addedIds: [] });
		const form = page.getByRole('button', { name: 'Add Meditate' }).element().closest('form');
		expect(form?.getAttribute('action')).toBe('?/addStarter');
		expect(form?.querySelector<HTMLInputElement>('input[name="starterId"]')?.value).toBe(
			'meditate'
		);
	});
});
