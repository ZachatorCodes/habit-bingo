import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { counts, type SquareState } from '#lib/game/square-state.ts';
import CardHeader from './CardHeader.svelte';

const rewards = { bingo: 'Ice cream', sixty: 'Movie night', blackout: 'A weekend away' };
const score = (overrides = {}) => ({
	counting: 4,
	percent: 44,
	lines: [] as number[][],
	tiers: [] as ('bingo' | 'sixtyPercent' | 'blackout')[],
	points: 120,
	...overrides
});

const base = {
	monthName: 'October',
	daysLeft: 14,
	size: 3 as const,
	rewards,
	states: ['empty', 'empty', 'empty', 'empty', 'free', 'empty', 'empty', 'empty', 'empty'] as const
};
const props = (overrides: { states?: SquareState[] } & Record<string, unknown> = {}) => {
	const merged = {
		...base,
		states: [...base.states] as SquareState[],
		score: score(),
		...overrides
	};
	return { counting: merged.states.map(counts), ...merged };
};

describe('CardHeader', () => {
	it('shows the month, days left, points and percent complete', async () => {
		render(CardHeader, props());
		await expect
			.element(page.getByRole('heading', { level: 1, name: 'October card' }))
			.toBeVisible();
		await expect.element(page.getByText('14 days left')).toBeVisible();
		await expect.element(page.getByText('120pts')).toBeVisible();
		await expect.element(page.getByText('44% complete')).toBeVisible();
	});

	it('uses the singular day', async () => {
		render(CardHeader, props({ daysLeft: 1 }));
		await expect.element(page.getByText('1 day left')).toBeVisible();
	});

	it('says how far the closest line is, and the next reward', async () => {
		render(CardHeader, props());
		await expect.element(page.getByText('2 squares from a line')).toBeVisible();
		await expect.element(page.getByText('Next reward: Ice cream')).toBeVisible();
	});

	it('celebrates a line, and says when none are left', async () => {
		const done = render(
			CardHeader,
			props({ states: ['complete', 'complete', 'complete', ...base.states.slice(3)] })
		);
		await expect.element(page.getByText('Bingo!')).toBeVisible();
		await done.unmount();
		render(CardHeader, props({ states: base.states.map((s) => (s === 'free' ? s : 'lost')) }));
		await expect.element(page.getByText('No lines left this month')).toBeVisible();
	});

	it('counts on-track squares toward a line, without calling it a bingo', async () => {
		// The middle row: two protected habits that count at month end, and the Free center.
		const states: SquareState[] = [...base.states];
		states[3] = 'held';
		states[5] = 'atRisk';
		const onTrack = render(
			CardHeader,
			props({ states, counting: states.map((s) => s === 'free') })
		);
		await expect.element(page.getByText('On track for a bingo')).toBeVisible();
		expect(page.getByText('Bingo!').elements()).toHaveLength(0);
		await onTrack.unmount();
		states[5] = 'empty';
		render(CardHeader, props({ states, counting: states.map((s) => s === 'free') }));
		await expect.element(page.getByText('1 square from a line')).toBeVisible();
	});

	it('uses a singular square and hides the next reward once all are reached', async () => {
		render(
			CardHeader,
			props({
				score: score({ tiers: ['bingo', 'sixtyPercent', 'blackout'] }),
				states: ['complete', 'complete', 'empty', ...base.states.slice(3)]
			})
		);
		await expect.element(page.getByText('1 square from a line')).toBeVisible();
		expect(page.getByText(/Next reward/).elements()).toHaveLength(0);
	});

	it('lists the three tiers with their rewards and marks reached ones in text', async () => {
		render(CardHeader, props({ size: 5, score: score({ tiers: ['bingo'] }) }));
		const tiers = page.getByRole('list', { name: 'Rewards' }).getByRole('listitem');
		expect(tiers.elements().map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Bingo Ice cream Reached',
			'12 squares Movie night',
			'Blackout A weekend away'
		]);
	});
});
