import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	newMember,
	newMemberWithHabits,
	setClock,
	startCard,
	waitForHydration
} from './fixtures.ts';

// The first 8 Quick start habits: Finish a book, Go biking, Call an old friend (anytime this
// month); Meditate, Power clean (2 days a week, this week); Scoop the litter box (every day); Drink water
// (8 a day); Eat out (a slip). The card starts on Thursday Oct 15; "today" is Tuesday Oct 20.
const OCT_15 = '2026-10-15T12:00:00Z';
const OCT_20 = '2026-10-20T12:00:00Z';

/** A member whose card started Oct 15, looking at Today on Oct 20. */
async function onToday(page: Page): Promise<void> {
	await newMemberWithHabits(page, 8);
	await setClock(page, OCT_15);
	await startCard(page);
	await setClock(page, OCT_20);
	await page.goto('/today');
	await waitForHydration(page);
}

const section = (page: Page, name: string) =>
	page.getByRole('region', { name }).getByRole('listitem');

test('a new card fills the Today sections', async ({ page }) => {
	await onToday(page);
	await expect(
		page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), / })
	).toBeVisible();
	await expect(section(page, 'Do today')).toHaveCount(2);
	await expect(section(page, 'This week')).toHaveCount(2);
	await expect(section(page, 'Anytime this month')).toHaveCount(3);
	await expect(section(page, 'Log a slip')).toHaveCount(1);
	await expect(section(page, 'Do today').filter({ hasText: 'Drink water' })).toContainText(
		'0/8 today'
	);
	// Tuesday through Saturday (the week starts Sunday) is 5 days.
	await expect(section(page, 'This week').filter({ hasText: 'Meditate' })).toContainText(
		'2 more · 5 days left'
	);
	await expect(page.getByRole('link', { name: 'See your October card' })).toBeVisible();
});

test('a double tap on + logs once', async ({ page }) => {
	await onToday(page);
	let posts = 0;
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('/log')) posts++;
	});
	await page.getByRole('button', { name: 'Log Drink water' }).dblclick();
	const row = section(page, 'Do today').filter({ hasText: 'Drink water' });
	await expect(row).toContainText('1/8 today');
	await page.waitForLoadState('networkidle');
	expect(posts).toBe(1);
});

test('logging moves a day habit to Done and back with undo', async ({ page }) => {
	await onToday(page);
	await page.getByRole('button', { name: 'Log Scoop the litter box' }).click();
	const done = page.getByRole('group', { name: /Done/ });
	await expect(page.getByText('Done (1)')).toBeVisible();
	await page.getByText('Done (1)').click();
	await expect(done.getByText('1/1 today')).toBeVisible();
	await page.getByRole('button', { name: 'Undo one Scoop the litter box' }).click();
	await expect(section(page, 'Do today').filter({ hasText: 'Scoop the litter box' })).toContainText(
		'0/1 today'
	);
});

test('earlier days are reachable and logging there counts', async ({ page }) => {
	await onToday(page);
	await page
		.getByRole('navigation', { name: 'Day' })
		.getByRole('link', { name: 'Yesterday' })
		.click();
	await expect(page).toHaveURL(/\/today\?day=2026-10-19$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page).toHaveURL(/\/today\?day=2026-10-19$/);
	await expect(section(page, 'Do today').filter({ hasText: 'Drink water' })).toContainText(
		'1/8 on Monday'
	);
});

test('the 4th day back is not offered and a post before the card started is refused', async ({
	page,
	baseURL
}) => {
	await onToday(page);
	const days = page.getByRole('navigation', { name: 'Day' }).getByRole('link');
	await expect(days).toHaveText(['Today', 'Yesterday', 'Sunday', 'Saturday']);
	await page.goto('/today?day=2026-10-16');
	await expect(
		page.getByRole('navigation', { name: 'Day' }).getByRole('link', { name: 'Today' })
	).toHaveAttribute('aria-current', 'date');

	const squareId = await page.locator('input[name="squareId"]').first().inputValue();
	const response = await page.request.post('/today?/log', {
		headers: { origin: baseURL! },
		form: { squareId, date: '2026-10-14' }
	});
	expect(response.status()).toBe(400);
	const foreign = await page.request.post('/today?/log', {
		headers: { origin: baseURL! },
		form: { squareId: 'not-a-square', date: '2026-10-20' }
	});
	expect(foreign.status()).toBe(404);
});

test('all done today', async ({ page }) => {
	await onToday(page);
	await page.getByRole('button', { name: 'Log Scoop the litter box' }).click();
	for (let i = 0; i < 8; i++) {
		await page.getByRole('button', { name: 'Log Drink water' }).click();
		// The 8th moves it to Done.
		if (i < 7) await expect(page.getByText(`${i + 1}/8 today`)).toBeVisible();
	}
	// Week habits need 2 days: today and yesterday.
	for (const name of ['Meditate', 'Power clean']) {
		await page.getByRole('button', { name: `Log ${name}` }).click();
		await expect(page.getByText('1 more · 5 days left').first()).toBeVisible();
	}
	await page.goto('/today?day=2026-10-19');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Log Meditate' }).click();
	await expect(page.getByText(/Done \(1\)/)).toBeVisible();
	await page.getByRole('button', { name: 'Log Power clean' }).click();
	await expect(page.getByText(/Done \(2\)/)).toBeVisible();
	await page.goto('/today');
	await expect(page.getByText('All done today', { exact: true })).toBeVisible();
});

test("on the 1st–3rd, last month's last days can still be logged", async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await setClock(page, OCT_15);
	await startCard(page);
	await setClock(page, '2026-11-01T12:00:00Z');
	await page.goto('/today');
	await waitForHydration(page);
	// No November card yet: build one, or finish October.
	await expect(page.getByRole('link', { name: 'Build one' })).toBeVisible();
	const days = page.getByRole('navigation', { name: 'Day' }).getByRole('link');
	await expect(days).toHaveText(['Yesterday', 'Friday', 'Thursday']);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(section(page, 'Do today').filter({ hasText: 'Drink water' })).toContainText(
		'1/8 on Saturday'
	);

	await setClock(page, '2026-11-04T12:00:00Z');
	await page.goto('/today');
	await expect(page.getByRole('link', { name: 'Build one' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Day' })).toHaveCount(0);
});

test('heads up points at what needs doing today', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await setClock(page, OCT_15);
	await startCard(page);
	// Oct 16: the two daily habits weren't logged on Oct 15, which can still be backfilled.
	await setClock(page, '2026-10-16T12:00:00Z');
	await page.goto('/today');
	await waitForHydration(page);
	const headsUp = page.getByRole('region', { name: 'Heads up' }).getByRole('link');
	await expect(headsUp).toHaveCount(2);
	// The board is shuffled, so the two can come in either order.
	for (const name of ['Scoop the litter box', 'Drink water']) {
		await expect(
			headsUp.filter({ hasText: `You didn't log ${name} yesterday: still time` })
		).toHaveCount(1);
	}
	await headsUp.filter({ hasText: 'Scoop the litter box' }).click();
	await expect(page).toHaveURL(/\/today\?day=2026-10-15$/);
	// Only today's view has it.
	await expect(page.getByRole('region', { name: 'Heads up' })).toHaveCount(0);
});

test('no card yet', async ({ page }) => {
	await newMember(page);
	await page.goto('/today');
	await expect(page.getByText('No card yet', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Build one' })).toBeVisible();
});

async function withoutJs(browser: Browser, page: Page): Promise<Page> {
	const context = await browser.newContext({ javaScriptEnabled: false });
	await context.addCookies(await page.context().cookies());
	return context.newPage();
}

test('Today works without JavaScript', async ({ page, browser }) => {
	await onToday(page);
	const noJs = await withoutJs(browser, page);
	await noJs.goto('/today');
	await noJs.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(noJs.getByText('1/8 today')).toBeVisible();
	await noJs.getByRole('button', { name: 'Undo one Drink water' }).click();
	await expect(noJs.getByText('0/8 today')).toBeVisible();
	await noJs.context().close();
});

test('logging updates instantly and survives a reload', async ({ page }) => {
	await onToday(page);
	// Hold the server's answer: the row must change before it arrives.
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	const isLog = (url: URL) => url.pathname === '/today' && url.search.startsWith('?/log');
	await page.route(isLog, async (route) => {
		await held;
		await route.continue();
	});
	const water = section(page, 'Do today').filter({ hasText: 'Drink water' });
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(water).toContainText('1/8 today');
	const answered = page.waitForResponse((response) => isLog(new URL(response.url())));
	release();
	await answered;
	await page.unroute(isLog);
	await page.reload();
	await expect(section(page, 'Do today').filter({ hasText: 'Drink water' })).toContainText(
		'1/8 today'
	);
});

test('a refused log rolls back with a message', async ({ page }) => {
	await onToday(page);
	// The clock steps back a day, so the page's "today" is now a day that has not happened.
	await setClock(page, '2026-10-19T12:00:00Z');
	const water = section(page, 'Do today').filter({ hasText: 'Drink water' });
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page.getByRole('status')).toContainText(
		"You can log any day of this card's month, up to today."
	);
	await expect(water).toContainText('0/8 today');
});

test('a Today row opens the habit sheet', async ({ page }) => {
	await onToday(page);
	await page.getByRole('link', { name: 'Drink water', exact: true }).click();
	// A panel on wide screens, the sheet's own page below that; both show the calendar.
	await expect(page.getByRole('grid')).toBeVisible();
	await expect(page).toHaveURL(/\/card\/squares\//);
});

test('reduced motion: no confetti canvas', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await onToday(page);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page.getByText('1/8 today')).toBeVisible();
	await expect(page.locator('body > canvas')).toHaveCount(0);
});

test('a log bursts confetti', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await onToday(page);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page.locator('body > canvas')).toHaveCount(1);
});

test('the optimistic view follows the row after several taps', async ({ page }) => {
	await onToday(page);
	const biking = section(page, 'Do today').filter({ hasText: 'Drink water' });
	// Each log is answered (and the page reloaded) before the next tap.
	for (const text of ['1/8 today', '2/8 today']) {
		const logged = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
		await page.getByRole('button', { name: 'Log Drink water' }).click();
		await logged;
		await expect(biking).toContainText(text);
	}
	// Drink water (8 a day) can't complete in two taps, so no BINGO interrupts. Hold the undo:
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	const isUnlog = (url: URL) => url.pathname === '/today' && url.search.startsWith('?/unlog');
	await page.route(isUnlog, async (route) => {
		await held;
		await route.continue();
	});
	const undo = page.getByRole('button', { name: 'Undo one Drink water' });
	await undo.click();
	await expect(biking).toContainText('1/8 today');
	const answered = page.waitForResponse((response) => isUnlog(new URL(response.url())));
	release();
	await answered;
	await page.unroute(isUnlog);
	await expect(biking).toContainText('1/8 today');
});

test('undoing to zero keeps keyboard focus in the row', async ({ page }) => {
	await onToday(page);
	await page.getByRole('button', { name: 'Log Drink water' }).click();
	await expect(page.getByText('1/8 today')).toBeVisible();
	await page.getByRole('button', { name: 'Undo one Drink water' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByText('0/8 today')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Log Drink water' })).toBeFocused();
});

test('logging and undoing keep the scroll position', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 500 });
	await onToday(page);
	const slip = page.getByRole('button', { name: 'Log Eat out' });
	await slip.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => window.scrollY);
	expect(before).toBeGreaterThan(100);
	// Measure before the next click: Playwright scrolls a target into view before clicking it.
	const logged = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
	await slip.click();
	await logged;
	await expect(section(page, 'Log a slip')).toContainText('1 of');
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(40);
	const undone = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
	await page.getByRole('button', { name: 'Undo one Eat out' }).click();
	await undone;
	await expect(section(page, 'Log a slip')).toContainText('0 of');
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(40);
});

test('the card header reflects check-ins', async ({ page }) => {
	await onToday(page);
	const pointsOf = async () => {
		await page.goto('/card');
		const text = await page.getByText(/^\d+ points?$/).innerText();
		return Number(text.split(' ')[0]);
	};
	const before = await pointsOf();
	await expect(page.getByText(/\d+% complete/)).toBeVisible();
	await page.goto('/today');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Log Finish a book' }).click();
	await expect(
		section(page, 'Anytime this month').filter({ hasText: 'Finish a book' })
	).toContainText('1 of 1 this month');
	expect(await pointsOf()).toBeGreaterThan(before);
});

test('keyboard focus stays on + after a log that leaves the row open', async ({ page }) => {
	await onToday(page);
	const log = page.getByRole('button', { name: 'Log Go biking' });
	await log.focus();
	const logged = page.waitForResponse((r) => r.url().includes('/today/__data.json'));
	await page.keyboard.press('Enter');
	await logged;
	await expect(log).toBeFocused();
});

test('focus follows the main button when a row meets its target and is undone', async ({
	page
}) => {
	await onToday(page);
	// An "anytime this month" row stays in its section when met, so the check can take focus.
	await page.getByRole('button', { name: 'Log Call an old friend' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Undo one Call an old friend' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Log Call an old friend' })).toBeFocused();
});
