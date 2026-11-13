import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SquareState } from '#lib/game/square-state.ts';
import CardBoard from './CardBoard.svelte';

function squares(count: number, free: number | null = null) {
	return Array.from({ length: count }, (_, i) => ({
		icon: 'flower-lotus',
		name: i === free ? 'Free' : `Habit ${i}`,
		state: (i === free ? 'free' : 'held') as SquareState
	}));
}

describe('CardBoard', () => {
	it('renders size × size squares with FREE in the 5×5 center', async () => {
		render(CardBoard, { size: 5, squares: squares(25, 12) });
		await expect.element(page.getByRole('img').first()).toBeVisible();
		expect(page.getByRole('img').elements()).toHaveLength(25);
		await expect.element(page.getByText('FREE')).toBeVisible();
		expect(page.getByRole('img').nth(12).element().getAttribute('data-state')).toBe('free');
	});

	it('renders nine squares on a 3×3 card', async () => {
		render(CardBoard, { size: 3, squares: squares(9) });
		expect(page.getByRole('img').elements()).toHaveLength(9);
	});

	it('names each square with its state in text', async () => {
		render(CardBoard, {
			size: 3,
			squares: [{ icon: 'flower-lotus', name: 'Meditate', state: 'held' }, ...squares(8)]
		});
		await expect.element(page.getByRole('img', { name: 'Meditate: protected' })).toBeVisible();
	});

	it('renders a linked center square with its label and state', async () => {
		const board: { icon: string; name: string; state: SquareState; link?: boolean }[] = squares(9);
		board[4] = { icon: 'alarm', name: "Build November's card", state: 'buildNext', link: true };
		render(CardBoard, { size: 3, squares: board });
		const link = page.getByRole('link', {
			name: "Build November's card: build next month's card"
		});
		await expect.element(link).toBeVisible();
		await expect.element(link).toHaveAttribute('href', '/card/next');
		expect(page.getByRole('link').elements()).toHaveLength(1);
	});
});
