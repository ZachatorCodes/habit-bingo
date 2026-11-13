import { expect, test, type Page } from '@playwright/test';
import { buildAndStartCard, newMember, setClock, waitForHydration } from './fixtures.ts';

// A 3×3 of 8 monthly goals ("Goal 1"…"Goal 8", once a month), started Saturday Oct 24 while the
// center is still Free. Only completed squares count mid-month, so the Free square and four goals
// make 5, the "5 squares" reward, wherever the board shuffle puts them.
const GOALS = ['Goal 1', 'Goal 2', 'Goal 3', 'Goal 4'];

async function freshCard(page: Page, baseURL: string): Promise<void> {
	await newMember(page);
	for (let i = 1; i <= 8; i++) {
		const response = await page.request.post('/me/habits/new', {
			headers: { origin: baseURL, accept: 'text/html' },
			form: {
				icon: 'flower-lotus',
				name: `Goal ${i}`,
				category: 'mind',
				direction: 'atLeast',
				period: 'month',
				countMode: 'days',
				target: '1'
			},
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
	}
	await setClock(page, '2026-10-24T12:00:00Z');
	await buildAndStartCard(page);
}

/** Logs a Today row `times` times, dismissing any reward that pops up on the way. */
async function logOnToday(page: Page, name: string, times = 1): Promise<void> {
	for (let i = 0; i < times; i++) {
		const saved = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
		await page.getByRole('button', { name: `Log ${name}` }).click();
		await saved;
		const nice = page.getByRole('button', { name: 'Nice!' });
		if (await nice.isVisible()) await nice.click();
	}
}

test('reaching a reward from Today celebrates and reveals it, once', async ({ page, baseURL }) => {
	await freshCard(page, baseURL!);
	await page.goto('/today');
	await waitForHydration(page);
	for (const name of GOALS.slice(0, -1)) await logOnToday(page, name);
	await page.getByRole('button', { name: `Log ${GOALS.at(-1)}` }).click();
	const reveal = page.getByRole('dialog', { name: /BINGO!|Reward earned/ });
	await expect(reveal).toContainText('Movie night');
	await reveal.getByRole('button', { name: 'Nice!' }).click();
	await expect(reveal).toBeHidden();

	// A reload doesn't replay it.
	await page.reload();
	await waitForHydration(page);
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('reaching a reward from the sheet closes it and celebrates on the card', async ({
	page,
	baseURL
}) => {
	await freshCard(page, baseURL!);
	await page.goto('/card');
	await waitForHydration(page);
	// Each goal is one of the card's 8 habit squares.
	for (const [i, name] of GOALS.entries()) {
		await page.getByRole('link', { name: new RegExp(`^${name}: `) }).click();
		const sheet = page.getByRole('dialog', { name });
		await expect(sheet).toBeVisible();
		const add = sheet.getByRole('button', { name: 'Add one' });
		if (await add.isVisible()) await add.click();
		else await sheet.getByRole('button', { name: 'Done that day' }).click();
		await expect(page.getByText(`${[13, 25, 38, 50][i]}% complete`)).toBeAttached();
		if (name === GOALS.at(-1)) break;
		if ((await sheet.count()) > 0) await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		const nice = page.getByRole('button', { name: 'Nice!' });
		if (await nice.isVisible()) await nice.click();
	}
	await expect(page.getByRole('dialog', { name: /BINGO!|Reward earned/ })).toContainText(
		'Movie night'
	);
	await expect(page.getByRole('dialog', { name: 'Call an old friend' })).toHaveCount(0);
});
