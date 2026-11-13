import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FeedItem from './FeedItem.svelte';

const now = new Date('2026-10-23T12:00:00Z');
const base = {
	id: 'e1',
	type: 'squareComplete' as const,
	payload: { name: 'Go biking', icon: 'bicycle' } as Record<string, unknown>,
	createdAt: new Date('2026-10-23T11:55:00Z'),
	author: { userId: 'u1', displayUsername: 'ana', avatarIcon: 'star' },
	reactions: { heart: 2, fire: 0, 'hands-clapping': 0, trophy: 0, star: 0, smiley: 0 },
	mine: 'heart' as const
};
const props = (over: Record<string, unknown> = {}) => ({
	item: { ...base, ...over },
	groupId: 'g1',
	now
});

describe('FeedItem', () => {
	it.each([
		['squareComplete', { name: 'Go biking' }, '@ana completed Go biking'],
		['squareComplete', { private: true }, '@ana completed a private habit'],
		['bingo', {}, '@ana got a bingo!'],
		['sixtyPercent', { squares: 12 }, '@ana reached 12 squares'],
		['sixtyPercent', {}, '@ana reached their middle reward'],
		['blackout', {}, '@ana got a blackout!'],
		['cardStarted', { month: '2026-10' }, '@ana started their October card'],
		['checkIn', { name: 'Drink water', date: '2026-10-22', count: 1 }, '@ana logged Drink water'],
		[
			'checkIn',
			{ name: 'Drink water', date: '2026-10-22', count: 8 },
			'@ana logged Drink water ×8'
		],
		['checkIn', { private: true, date: '2026-10-22', count: 1 }, '@ana logged a private habit'],
		[
			'checkIn',
			{ name: 'Drink water', date: '2026-10-22', count: 2, backfilled: true },
			'@ana logged Drink water ×2 for Thu, Oct 22'
		]
	])('reads %s', async (type, payload, text) => {
		render(FeedItem, props({ type, payload }));
		await expect.element(page.getByText(text)).toBeVisible();
	});

	it('shows relative time', async () => {
		render(FeedItem, props());
		await expect.element(page.getByText('5m')).toBeVisible();
	});

	it('names reaction buttons and hides zero counts', async () => {
		render(FeedItem, props());
		await expect
			.element(page.getByRole('button', { name: 'React with heart, 2, you reacted' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'React with fire' })).toBeVisible();
		await expect.element(page.getByText('0', { exact: true })).not.toBeInTheDocument();
	});
});
