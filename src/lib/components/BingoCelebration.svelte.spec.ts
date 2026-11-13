import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BingoCelebration from './BingoCelebration.svelte';
import { CONFETTI_COLORS } from '#lib/components/card/celebrate.ts';

const rewards = { bingo: 'Ice cream', sixty: 'Movie night', blackout: 'A weekend away' };

describe('BingoCelebration', () => {
	it('announces BINGO for a new line', async () => {
		render(BingoCelebration, {
			lines: [[0, 1, 2]],
			tiers: [],
			rewards,
			sixtyThreshold: 5,
			ondone: () => {}
		});
		await expect.element(page.getByRole('status')).toHaveTextContent('BINGO!');
	});

	it('reveals the reward for a newly reached tier', async () => {
		const ondone = vi.fn();
		render(BingoCelebration, {
			lines: [[0, 1, 2]],
			tiers: ['bingo', 'blackout'],
			rewards,
			sixtyThreshold: 5,
			ondone
		});
		const reveal = page.getByRole('dialog', { name: 'BINGO!' });
		await expect.element(reveal).toHaveTextContent('Ice cream');
		await expect.element(reveal).toHaveTextContent('A weekend away');
		await page.getByRole('button', { name: 'Nice!' }).click();
		expect(ondone).toHaveBeenCalled();
	});

	it('shows BINGO! and each earned reward', async () => {
		render(BingoCelebration, {
			lines: [[0, 1, 2]],
			tiers: ['bingo', 'blackout'],
			rewards,
			sixtyThreshold: 5,
			ondone: () => {}
		});
		await expect.element(page.getByRole('heading', { name: 'BINGO!' })).toBeVisible();
		expect(page.getByRole('listitem').elements()).toHaveLength(2);
		await expect.element(page.getByText('First bingo — Ice cream')).toBeVisible();
		await expect.element(page.getByText('Blackout — A weekend away')).toBeVisible();
	});

	it('does not claim BINGO! for a 60% reward without a line', async () => {
		render(BingoCelebration, {
			lines: [],
			tiers: ['sixtyPercent'],
			rewards,
			sixtyThreshold: 5,
			ondone: () => {}
		});
		await expect.element(page.getByRole('heading', { name: 'Reward earned' })).toBeVisible();
		expect(page.getByRole('heading', { name: 'BINGO!' }).elements()).toHaveLength(0);
	});
	it('uses the Garden confetti palette', () => {
		expect(CONFETTI_COLORS).toEqual(['#2F5D46', '#4E7E62', '#E3ECDD', '#D9693F', '#5B8AA6']);
	});

	it('finishes on its own when there is no reward to reveal', async () => {
		const ondone = vi.fn();
		render(BingoCelebration, {
			lines: [[0, 1, 2]],
			tiers: [],
			rewards,
			sixtyThreshold: 5,
			ondone,
			duration: 50
		});
		await expect.poll(() => ondone.mock.calls.length, { timeout: 2000 }).toBe(1);
	});

	it('puts BINGO! into a live region that was already there', async () => {
		const screen = render(BingoCelebration, {
			lines: [[0, 1, 2]],
			tiers: [],
			rewards,
			sixtyThreshold: 5,
			ondone: () => {}
		});
		const region = screen.container.querySelector('[role="status"]');
		expect(region?.textContent?.trim()).toBe('');
		await expect.element(page.getByRole('status')).toHaveTextContent('BINGO!');
		expect(page.getByRole('status').element()).toBe(region);
	});

	it('returns focus to where it was after Nice!', async () => {
		const opener = document.createElement('button');
		opener.textContent = 'Log Go biking';
		document.body.append(opener);
		opener.focus();
		render(BingoCelebration, {
			lines: [],
			tiers: ['bingo'],
			rewards,
			sixtyThreshold: 5,
			ondone: () => {}
		});
		await page.getByRole('button', { name: 'Nice!' }).click();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});
