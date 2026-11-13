import { expect, test, type Page } from '@playwright/test';
import {
	buildAndStartCard,
	signIn,
	expectNoHorizontalScroll,
	newMember,
	newMemberWithHabits,
	setClock,
	waitForHydration
} from './fixtures.ts';

test('phone keeps bottom tabs', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone');
	await newMember(page);
	await page.goto('/today');
	const box = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(2);
	expect(box.height).toBeLessThan(120);
});

test('sidebar navigates and marks the current page', async ({ page }, info) => {
	test.skip(info.project.name === 'phone');
	await newMember(page);
	await page.goto('/today');
	await waitForHydration(page);
	const nav = page.getByRole('navigation', { name: 'Main' });
	const box = (await nav.boundingBox())!;
	expect(box.x).toBe(0);
	expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
	const card = nav.getByRole('link', { name: 'Card' });
	await card.click();
	await expect(page).toHaveURL(/\/card$/);
	await expect(card).toHaveAttribute('aria-current', 'page');
	if (info.project.name === 'desktop') await expect(card.getByText('Card')).toBeVisible();
	else expect((await card.getByText('Card').boundingBox())!.width).toBeLessThanOrEqual(1); // sr-only
});

test('habit panel holds and returns focus', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await buildAndStartCard(page);
	await page.goto('/card');
	await waitForHydration(page);
	const square = page.getByRole('link', { name: /^Drink water: / });
	await square.click();
	const dialog = page.getByRole('dialog', { name: 'Drink water' });
	await expect(dialog).toBeVisible();
	const box = (await dialog.boundingBox())!;
	expect(Math.abs(box.x + box.width - page.viewportSize()!.width)).toBeLessThanOrEqual(2);
	expect(Math.abs(box.width - 420)).toBeLessThanOrEqual(4);
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('Tab');
		// A modal dialog hands focus to the browser UI at its end (body), never to the page behind.
		expect(
			await dialog.evaluate(
				(d) => d.contains(document.activeElement) || document.activeElement === document.body
			)
		).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(square).toBeFocused();
});

test('no horizontal scroll at wide widths', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMember(page);
	const groupPath = await createGroup(page);
	for (const width of [768, 1024, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		for (const route of [
			'/today',
			'/card',
			'/card/build/habits',
			'/me/habits',
			'/groups',
			groupPath,
			'/me',
			'/me/history'
		]) {
			await page.goto(route);
			await waitForHydration(page);
			await expectNoHorizontalScroll(page);
		}
	}
	for (const route of ['/', '/signin', '/privacy']) {
		await page.goto(route);
		await expectNoHorizontalScroll(page);
	}
	await page.context().clearCookies();
	await signIn(page, 'e2e_admin', 'e2e admin password 1');
	for (const width of [768, 1024, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/admin');
		await waitForHydration(page);
		await expectNoHorizontalScroll(page);
	}
});

/** Creates a group through the form and returns its page path. */
async function createGroup(page: Page): Promise<string> {
	await page.goto('/groups/new');
	await waitForHydration(page);
	await page.getByRole('textbox', { name: 'Name' }).fill('Wide group');
	await page.getByRole('button', { name: 'Create group' }).click();
	await expect(page.getByRole('heading', { level: 1, name: /Wide group/ })).toBeVisible();
	return new URL(page.url()).pathname;
}

test('group page puts feed beside a leaderboard and members column', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMember(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(await createGroup(page));
	const feed = (await page.getByRole('region', { name: 'Feed' }).boundingBox())!;
	const board = (await page.getByRole('region', { name: 'Leaderboard' }).boundingBox())!;
	const members = (await page.getByRole('region', { name: 'Members' }).boundingBox())!;
	expect(board.x).toBeGreaterThan(feed.x + feed.width - 1);
	expect(members.y).toBeGreaterThan(board.y + board.height - 1);
	expect(members.x).toBe(board.x);
	await expect(page.getByRole('navigation', { name: 'Group' })).toBeHidden();
});

test('members tab link works at every width', async ({ page }, info) => {
	await newMember(page);
	const path = await createGroup(page);
	await page.goto(`${path}?tab=members`);
	await expect(page.getByRole('region', { name: 'Members' })).toBeVisible();
	if (info.project.name === 'phone')
		await expect(page.getByRole('region', { name: 'Leaderboard' })).toBeHidden();
});

test('today shows the board beside the list', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await buildAndStartCard(page);
	await page.goto('/today');
	await waitForHydration(page);
	const board = page.getByRole('region', { name: 'Your card' });
	await expect(board).toBeVisible();
	const heading = (await page.getByRole('heading', { name: 'Do today' }).boundingBox())!;
	expect((await board.boundingBox())!.x).toBeGreaterThan(heading.x + heading.width);
	const labels = () => board.getByRole('img').evaluateAll((els) => els.map((el) => el.ariaLabel));
	const before = await labels();
	const reload = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
	await page.getByRole('button', { name: 'Log Go biking' }).click();
	await reload;
	await expect.poll(labels).not.toEqual(before);
});

test('today without a card shows Build one beside the list', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMember(page);
	await page.goto('/today');
	await expect(
		page.getByRole('region', { name: 'Your card' }).getByRole('link', { name: 'Build one' })
	).toBeVisible();
});

test('card names show on 5×5 at wide widths', async ({ page, baseURL }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMember(page);
	await setClock(page, '2026-10-15T12:00:00Z'); // the center is Free before the last week
	for (let i = 0; i < 24; i++) {
		const response = await page.request.post('/me/habits/new', {
			headers: { origin: baseURL!, accept: 'text/html' },
			form: {
				icon: 'flower-lotus',
				name: `Habit ${String(i).padStart(2, '0')} wide`,
				category: 'mind',
				direction: 'atLeast',
				period: 'week',
				countMode: 'days',
				target: '2'
			},
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
	}
	await page.goto('/card/build');
	await waitForHydration(page);
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: /5×5/ }) })
		.click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await waitForHydration(page);
	const labels = page.locator('label').filter({ has: page.getByRole('checkbox') });
	for (let i = 0; i < 24; i++) await labels.nth(i).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await waitForHydration(page);
	await page.getByLabel('First bingo').fill('Ice cream');
	await page.getByLabel('12 squares').fill('Movie night');
	await page.getByLabel('Blackout').fill('A weekend away');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await page.setViewportSize({ width: 1440, height: 900 });
	const names = page.locator('main [data-label]');
	await expect(names).toHaveCount(24);
	for (const name of await names.all()) await expect(name).toBeVisible();
	const square = (await page.locator('main [role="img"][data-state]').first().boundingBox())!;
	expect(square.width).toBeGreaterThanOrEqual(100);
});

test('today squares open the habit panel over Today', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await buildAndStartCard(page);
	await page.goto('/today');
	await waitForHydration(page);
	const square = page
		.getByRole('region', { name: 'Your card' })
		.getByRole('link', { name: /^Go biking: / });
	await square.click();
	await expect(page.getByRole('dialog', { name: 'Go biking' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Do today' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page).toHaveURL(/\/today$/);
	await expect(square).toBeFocused();
});

test('builder previews picks on the habits step', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await page.goto('/card/build');
	await waitForHydration(page);
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: /3×3/ }) })
		.click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await waitForHydration(page);
	const labels = page.locator('label').filter({ has: page.getByRole('checkbox') });
	const names = ['Drink water', 'Go biking'];
	for (const name of names) await labels.filter({ hasText: name }).click();
	const preview = page.getByRole('region', { name: 'Preview' });
	await expect(preview).toBeVisible();
	for (const name of names)
		await expect(preview.getByRole('img', { name: new RegExp(`^${name}`) })).toBeVisible();
	await expect(preview.getByRole('img', { name: /^Empty/ })).toHaveCount(6);
});

test('library filter is a side list', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/me/habits');
	await waitForHydration(page);
	const links = page.getByRole('navigation', { name: 'Filter by category' }).getByRole('link');
	const first = (await links.nth(0).boundingBox())!;
	const second = (await links.nth(1).boundingBox())!;
	expect(second.y).toBeGreaterThan(first.y);
	const row = (await page
		.locator('main ul li')
		.filter({ hasText: 'Drink water' })
		.first()
		.boundingBox())!;
	expect(first.x + first.width).toBeLessThanOrEqual(row.x + 1);
});

test('sign-in is a centred card', async ({ page }, info) => {
	test.skip(info.project.name === 'phone');
	await page.goto('/signin');
	const card = page.locator('main section').filter({ has: page.locator('form') });
	const box = (await card.boundingBox())!;
	expect(box.width).toBeLessThanOrEqual(480);
	expect(Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)).toBeLessThanOrEqual(4);
});

test('the cookie notice is centred on pages without the sidebar', async ({ page }, info) => {
	test.skip(info.project.name === 'phone');
	await page.goto('/signin');
	const notice = page.getByRole('region', { name: 'Cookie notice' });
	const box = (await notice.boundingBox())!;
	expect(Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)).toBeLessThanOrEqual(4);
});

test('landing band pads for the notch', async ({ page }, info) => {
	test.skip(info.project.name === 'phone');
	await page.goto('/');
	await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '40px'));
	const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
	expect(h1.y).toBeGreaterThanOrEqual(40 + 80);
});

/** The page header and the content panel right after it, as boxes. */
async function headerAndPanel(page: Page) {
	const header = (await page.locator('main header').first().boundingBox())!;
	const panel = (await page.locator('main header + section').first().boundingBox())!;
	return { header, panel };
}

test('today header at desktop: a 40px title, no summary or card link, as wide as the content', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-15T12:00:00Z');
	await buildAndStartCard(page);
	await page.goto('/today');
	await waitForHydration(page);
	const header = page.locator('main header').first();
	await expect(header.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '40px');
	await expect(header.getByText(/things to do today|All done for today/)).toBeHidden();
	await expect(header.getByRole('link', { name: /See your \w+ card/ })).toBeHidden();
	const { header: h, panel } = await headerAndPanel(page);
	expect(Math.abs(h.x - panel.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(h.width - panel.width)).toBeLessThanOrEqual(1);
});

test('today board column at desktop: level with the list, points and card link under it', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-15T12:00:00Z');
	await buildAndStartCard(page);
	await page.goto('/today');
	await waitForHydration(page);
	const column = page.getByRole('region', { name: 'Your card' });
	const first = column.locator('xpath=preceding-sibling::*[1]/*[1]');
	const squares = column.getByRole('img');
	const top = (await squares.first().boundingBox())!.y;
	expect(Math.abs(top - (await first.boundingBox())!.y)).toBeLessThanOrEqual(1);
	const bottom = await squares.evaluateAll((els) =>
		Math.max(...els.map((el) => el.getBoundingClientRect().bottom))
	);
	const points = column.getByText(/^\d+\s*pts$/);
	const link = column.getByRole('link', { name: 'See your October card' });
	expect((await points.boundingBox())!.y).toBeGreaterThan(bottom);
	expect((await link.boundingBox())!.y).toBeGreaterThan(bottom);
});

test('the shared header is 40px and as wide as a full-width panel at desktop', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop');
	await newMember(page);
	// Pages whose content is a narrower grid (Me) line up in their own page PR.
	for (const path of ['/groups']) {
		await page.goto(path);
		await expect(page.locator('main header h1')).toHaveCSS('font-size', '40px');
		const { header, panel } = await headerAndPanel(page);
		expect(Math.abs(header.x - panel.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(header.width - panel.width)).toBeLessThanOrEqual(1);
	}
});
