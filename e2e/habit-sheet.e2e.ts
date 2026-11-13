import { expect, test, type Page } from '@playwright/test';
import {
	buildAndStartCard,
	newMember,
	newMemberWithHabits,
	setClock,
	waitForHydration
} from './fixtures.ts';

// First 8 Quick start habits; the card starts Thursday Oct 15 and "today" is Tuesday Oct 20.
async function onCard(page: Page): Promise<void> {
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-15T12:00:00Z');
	await buildAndStartCard(page);
	await setClock(page, '2026-10-20T12:00:00Z');
	await page.goto('/card');
	await waitForHydration(page);
}

// The same, with the card started on Thursday Oct 1, so Oct 10 (a Saturday) can be logged.
async function onCardFromFirst(page: Page): Promise<void> {
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-01T12:00:00Z');
	await buildAndStartCard(page);
	await setClock(page, '2026-10-20T12:00:00Z');
	await page.goto('/card');
	await waitForHydration(page);
}

const square = (page: Page, name: string) =>
	page.getByRole('link', { name: new RegExp(`^${name}: `) });

test('tapping a square opens its sheet and the back button closes it', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('8 times a day');
	await expect(sheet).toContainText('Health');
	await expect(page).toHaveURL(/\/card\/squares\/[0-9a-f-]{36}$/);
	await page.goBack();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/\/card$/);
	await square(page, 'Drink water').click();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(square(page, 'Drink water')).toBeFocused();
});

test('logging another day from the sheet', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	await sheet.getByRole('button', { name: 'Monday October 19, not logged' }).click();
	await expect(sheet.getByRole('heading', { name: 'Monday, Oct 19: 0 logged' })).toBeVisible();
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await expect(sheet.getByRole('status', { name: 'Count' })).toHaveText('1');
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await expect(sheet.getByRole('status', { name: 'Count' })).toHaveText('2');
	await expect(sheet.getByRole('button', { name: 'Monday October 19, 2 logged' })).toBeVisible();
	await sheet.getByRole('button', { name: 'Remove one' }).click();
	await expect(sheet.getByRole('status', { name: 'Count' })).toHaveText('1');
});

test('log a day 10 days ago from the calendar', async ({ page }) => {
	await onCardFromFirst(page);
	// The link wraps the square, which carries the label.
	const squareLabel = () =>
		square(page, 'Go biking').evaluate((a) =>
			a.querySelector('[aria-label]')!.getAttribute('aria-label')
		);
	const before = await squareLabel();
	await square(page, 'Go biking').click();
	const sheet = page.getByRole('dialog', { name: 'Go biking' });
	await sheet.getByRole('button', { name: 'Saturday October 10, not logged' }).click();
	await expect(sheet.getByRole('heading', { name: 'Saturday, Oct 10: 0 logged' })).toBeVisible();
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await expect(sheet.getByRole('button', { name: 'Saturday October 10, 1 logged' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect.poll(squareLabel).not.toBe(before);
});

test('deleting an old slip brings back a lost square', async ({ page }) => {
	await onCardFromFirst(page);
	// On the sheet's own page, so each save is a plain reload.
	await page.goto((await square(page, 'Eat out').getAttribute('href'))! + '?day=2026-10-08');
	await waitForHydration(page);
	const count = page.getByRole('status', { name: 'Count' });
	// Eat out is at most 10 a month: the 11th slip loses the square.
	for (let n = 1; n <= 11; n++) {
		await page.getByRole('button', { name: 'Add one' }).click();
		await expect(count).toHaveText(String(n));
	}
	await expect(page.getByText('Lost', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Remove one' }).click();
	await expect(count).toHaveText('10');
	// Back at the limit, not over it: no longer lost.
	await expect(page.getByText('At risk: at the limit')).toBeVisible();
	await expect(page.getByText('Lost', { exact: true })).toHaveCount(0);
});

test('future days are disabled', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	await expect(
		sheet.getByRole('button', { name: "Wednesday October 21, can't log" })
	).toBeDisabled();
	await expect(
		sheet.getByRole('button', { name: "Wednesday October 14, can't log" })
	).toBeDisabled();
});

test('days you cannot log look disabled', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	const future = sheet.getByRole('button', { name: "Wednesday October 21, can't log" });
	const open = sheet.getByRole('button', { name: 'Monday October 19, not logged' });
	await expect(future).toHaveCSS('color', 'rgb(92, 106, 96)');
	await expect(open).not.toHaveCSS('color', 'rgb(92, 106, 96)');
});

// Holds the first sheet refresh back until the test releases it, so it lands after later ones.
async function delayFirstRefresh(page: Page) {
	let release!: () => void;
	let seen!: () => void;
	const held = new Promise<void>((r) => (release = r));
	const intercepted = new Promise<void>((r) => (seen = r));
	let first = true;
	await page.route(/\/squares\/[^/]+\/__data\.json.*refresh=/, async (route) => {
		if (!first) return route.continue();
		first = false;
		const response = await route.fetch();
		seen();
		await held;
		await route.fulfill({ response });
	});
	return { release, intercepted };
}

test('a late refresh does not undo a newer count', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	const count = sheet.getByRole('status', { name: 'Count' });
	const { release, intercepted } = await delayFirstRefresh(page);
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await intercepted;
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await expect(count).toHaveText('2');
	await page.waitForTimeout(800); // the second refresh lands and is applied first
	release();
	await page.waitForTimeout(800);
	await expect(count).toHaveText('2');
});

test('a refresh that lands after Escape does not reopen the sheet', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	const sheet = page.getByRole('dialog', { name: 'Drink water' });
	const { release, intercepted } = await delayFirstRefresh(page);
	await sheet.getByRole('button', { name: 'Add one' }).click();
	await intercepted;
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	release();
	await page.waitForTimeout(1000);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/card$/);
});

test('a bad day parameter falls back to today', async ({ page }) => {
	await onCard(page);
	const href = (await square(page, 'Drink water').getAttribute('href'))!;
	for (const day of ['2099-01-01', 'nope', '2026-09-10', '2026-10-14']) {
		const response = await page.goto(`${href}?day=${day}`);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Tuesday, Oct 20: 0 logged' })).toBeVisible();
	}
});

test('the days toggle marks and clears a day', async ({ page }) => {
	await onCard(page);
	await square(page, 'Meditate').click();
	const sheet = page.getByRole('dialog', { name: 'Meditate' });
	const toggle = sheet.getByRole('button', { name: 'Done that day' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet).toContainText('1 more · 5 days left');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(sheet).toContainText('2 more · 5 days left');
});

test('the sheet works without JavaScript', async ({ page, browser }) => {
	await onCard(page);
	const href = await square(page, 'Drink water').getAttribute('href');
	const context = await browser.newContext({ javaScriptEnabled: false });
	await context.addCookies(await page.context().cookies());
	const noJs = await context.newPage();
	await noJs.goto(href!);
	await expect(noJs.getByRole('heading', { level: 1, name: 'Drink water' })).toBeVisible();
	await noJs.getByRole('button', { name: 'Add one' }).click();
	await expect(noJs.getByRole('status', { name: 'Count' })).toHaveText('1');
	await noJs.getByRole('link', { name: 'Back to card' }).click();
	await expect(noJs).toHaveURL(/\/card$/);
	await context.close();
});

test('calendar logging works without JavaScript', async ({ page, browser }) => {
	await onCard(page);
	const href = (await square(page, 'Drink water').getAttribute('href'))!;
	const context = await browser.newContext({ javaScriptEnabled: false });
	await context.addCookies(await page.context().cookies());
	const noJs = await context.newPage();
	await noJs.goto(href);
	await noJs.getByRole('link', { name: 'Monday October 19, not logged' }).click();
	await expect(noJs.getByRole('heading', { name: 'Monday, Oct 19: 0 logged' })).toBeVisible();
	await noJs.getByRole('button', { name: 'Add one' }).click();
	await expect(noJs.getByRole('status', { name: 'Count' })).toHaveText('1');
	await expect(noJs.getByRole('link', { name: 'Monday October 19, 1 logged' })).toBeVisible();
	await context.close();
});

test("someone else's square, the center, or a missing one is 404", async ({ page, browser }) => {
	await onCard(page);
	const href = await square(page, 'Drink water').getAttribute('href');
	const other = await (await browser.newContext()).newPage();
	await newMember(other);
	expect((await other.goto(href!))?.status()).toBe(404);
	expect((await page.goto('/card/squares/not-a-square'))?.status()).toBe(404);
});

test('closing the sheet before a save finishes keeps it closed', async ({ page }) => {
	await onCard(page);
	await square(page, 'Drink water').click();
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	const isLog = (url: URL) =>
		url.pathname.startsWith('/card/squares/') && url.search.startsWith('?/log');
	await page.route(isLog, async (route) => {
		await held;
		await route.continue();
	});
	const answered = page.waitForResponse((r) => isLog(new URL(r.url())));
	await page.getByRole('dialog').getByRole('button', { name: 'Add one' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
	release();
	await answered;
	await page.waitForTimeout(1000);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/card$/);
});

test('a double tap opens one sheet that still closes', async ({ page }) => {
	await onCard(page);
	// Two taps in the same moment, before the first sheet has loaded.
	await square(page, 'Drink water').evaluate((link: HTMLElement) => {
		link.click();
		link.click();
	});
	await expect(page.getByRole('dialog', { name: 'Drink water' })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/card$/);
});

test('tapping Card again keeps the latest board', async ({ page }) => {
	await onCard(page);
	const points = () =>
		page
			.getByText(/^\d+% complete$/)
			.first()
			.innerText();
	const before = await points();
	await square(page, 'Go biking').click();
	await page.getByRole('dialog').getByRole('button', { name: 'Add one' }).click();
	await expect(page.getByRole('dialog').getByRole('status', { name: 'Count' })).toHaveText('1');
	await expect.poll(points).not.toBe(before);
	const after = await points();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Card' }).click();
	await page.waitForTimeout(500);
	expect(await points()).toBe(after);
});
