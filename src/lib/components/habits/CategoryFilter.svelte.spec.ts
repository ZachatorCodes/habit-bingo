import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryId } from '#lib/game/categories.ts';
import CategoryFilter from './CategoryFilter.svelte';

const counts: Record<CategoryId, number> = {
	fitness: 2,
	health: 0,
	mind: 1,
	home: 0,
	social: 0,
	learning: 0,
	creative: 0,
	money: 0,
	other: 0
};

describe('CategoryFilter', () => {
	it('links categories that have habits with their count and marks the selected one', async () => {
		render(CategoryFilter, { selected: 'fitness', counts, archived: false });
		await expect
			.element(page.getByRole('link', { name: /All/ }))
			.toHaveAttribute('href', '/me/habits');
		const fitness = page.getByRole('link', { name: /Fitness/ });
		await expect.element(fitness).toHaveAttribute('href', '/me/habits?category=fitness');
		await expect.element(fitness).toHaveAttribute('aria-current', 'page');
		await expect.element(fitness).toHaveTextContent('2');
		await expect
			.element(page.getByRole('link', { name: /Mind/ }))
			.not.toHaveAttribute('aria-current');
		expect(page.getByRole('link').elements()).toHaveLength(3);
	});

	it('keeps the archived view when switching category', async () => {
		render(CategoryFilter, { selected: null, counts, archived: true });
		await expect
			.element(page.getByRole('link', { name: /Mind/ }))
			.toHaveAttribute('href', '/me/habits?category=mind&archived=1');
		await expect
			.element(page.getByRole('link', { name: /All/ }))
			.toHaveAttribute('href', '/me/habits?archived=1');
		await expect
			.element(page.getByRole('link', { name: /All/ }))
			.toHaveAttribute('aria-current', 'page');
	});
});
