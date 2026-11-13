import { expect, test, type Page } from '@playwright/test';
import {
	newMember,
	newMemberWithHabits,
	setClock,
	startCard,
	waitForHydration
} from './fixtures.ts';

/** A member whose October card has one check-in (Drink water on Oct 20). */
async function octoberCard(page: Page): Promise<void> {
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-15T12:00:00Z');
	await startCard(page);
	await setClock(page, '2026-10-20T12:00:00Z');
	await page.goto('/today');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page.getByText('1/8 today')).toBeVisible();
}

const banner = (page: Page) => page.getByRole('link', { name: 'Your October recap is ready' });

test('a finished month gets a banner, a recap and a History entry', async ({ page }) => {
	await octoberCard(page);
	await setClock(page, '2026-11-04T12:00:00Z');
	await page.goto('/today');
	await banner(page).click();

	await expect(page).toHaveURL(/\/me\/history\/2026-10$/);
	await expect(page.getByRole('heading', { level: 1, name: 'October recap' })).toBeVisible();
	await expect(page.getByText('Drink water: 1 check-in')).toBeVisible();
	await expect(page.getByText(/\d of 9 squares counting/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Rewards earned' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: "Build November's card" })).toBeVisible();

	await page.goto('/today');
	await expect(page.getByRole('link', { name: 'Build one' })).toBeVisible();
	await expect(banner(page)).toHaveCount(0);
	await page.goto('/me');
	await page.getByRole('link', { name: /History/ }).click();
	await expect(page.getByRole('link', { name: /^October 2026 · \d+ points?/ })).toBeVisible();
});

test('on the 3rd the month is still open: no banner, no history', async ({ page }) => {
	await octoberCard(page);
	await setClock(page, '2026-11-03T12:00:00Z');
	await page.goto('/today');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(banner(page)).toHaveCount(0);
	await page.goto('/me/history');
	await expect(
		page.getByText('No finished months yet. Your first recap arrives on the 4th of next month.')
	).toBeVisible();
});

test('a recap that does not exist is not found', async ({ page }) => {
	await newMember(page);
	for (const month of ['2026-13', 'abc', '2026-09']) {
		const response = await page.request.get(`/me/history/${month}`);
		expect(response.status()).toBe(404);
	}
});

test('hovering the banner does not mark the recap seen', async ({ page }) => {
	await octoberCard(page);
	await setClock(page, '2026-11-04T12:00:00Z');
	await page.goto('/today');
	await waitForHydration(page);
	await banner(page).hover();
	await page.waitForTimeout(500);
	await page.reload();
	await expect(banner(page)).toBeVisible();
});

test('Dismiss hides the banner without opening the recap', async ({ page }) => {
	await octoberCard(page);
	await setClock(page, '2026-11-04T12:00:00Z');
	await page.goto('/today');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(banner(page)).toHaveCount(0);
	await expect(page).toHaveURL(/\/today$/);
});

test('Dismiss works without JavaScript', async ({ page, browser }) => {
	await octoberCard(page);
	await setClock(page, '2026-11-04T12:00:00Z');
	const context = await browser.newContext({ javaScriptEnabled: false });
	await context.addCookies(await page.context().cookies());
	const noJs = await context.newPage();
	await noJs.goto('/today');
	await noJs.getByRole('button', { name: 'Dismiss' }).click();
	await expect(noJs.getByRole('link', { name: 'Build one' })).toBeVisible();
	await expect(banner(noJs)).toHaveCount(0);
	await context.close();
});
