import { expect, test, type Page } from '@playwright/test';
import {
	expectNoHorizontalScroll,
	newMember,
	newMemberWithHabits,
	newMemberWithoutJs,
	setClock,
	waitForHydration
} from './fixtures.ts';

/** Builds a 3×3 card up to the Board step with the first eight habits. */
async function buildToBoard(page: Page): Promise<void> {
	await page.goto('/card/build');
	await expect(page).toHaveURL(/\/card\/build\/size$/);
	await waitForHydration(page);
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: /3×3/ }) })
		.click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await waitForHydration(page);
	const labels = page.locator('label').filter({ has: page.getByRole('checkbox') });
	for (let i = 0; i < 8; i++) await labels.nth(i).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await waitForHydration(page);
	await page.getByLabel('First bingo').fill('Ice cream');
	await page.getByLabel('5 squares').fill('Movie night');
	await page.getByLabel('Blackout').fill('A weekend away');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await waitForHydration(page);
}

/** The squares' accessible names, in board order. */
async function squareNames(page: Page): Promise<string[]> {
	return page
		.locator('main [role="img"][data-state]')
		.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
}

test('card sizes carry no points multiplier', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await page.goto('/card/build');
	await expect(page.getByText('8 habits', { exact: true })).toBeVisible();
	await expect(page.getByText('24 habits', { exact: true })).toBeVisible();
	await expect(page.getByText(/× points/)).toHaveCount(0);
});

test('a new card starts with 0 pts and no bingo', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-11-10T12:00:00Z');
	await buildToBoard(page);
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await expect(page.getByText(/^0\s*pts$/)).toBeVisible();
	await expect(page.getByText('Bingo!')).toHaveCount(0);
	await expect(page.getByRole('list', { name: 'Rewards' }).getByText('Reached')).toHaveCount(0);
});

test('a new member builds and starts a 3×3 card', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await buildToBoard(page);
	await expect(
		page.getByText(
			'You can change habits, targets, rewards and the board for 48 hours after you start.'
		)
	).toBeVisible();
	expect(await squareNames(page)).toHaveLength(9);

	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await expect(page.getByRole('heading', { name: /\w+ card$/ })).toBeVisible();
	await expect(page.getByText('Card started!')).toBeVisible();
	expect(await squareNames(page)).toHaveLength(9);
	const rewards = page.getByRole('list', { name: 'Rewards' });
	await expect(rewards.getByText('Ice cream')).toBeVisible();
	await expect(rewards.getByText('5 squares')).toBeVisible();
	await expect(rewards.getByText('Movie night')).toBeVisible();
	await expect(rewards.getByText('A weekend away')).toBeVisible();
	await expect(page.getByText(/Edits close/)).toBeVisible();

	// The draft is gone: building again goes to the card.
	await page.goto('/card/build');
	await expect(page).toHaveURL(/\/card$/);
});

test('shuffle changes the board but keeps the habits', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await buildToBoard(page);
	const before = await squareNames(page);
	// A shuffle can land on the same order by chance (1 in 362,880), so try a few times.
	let after = before;
	for (let tries = 0; tries < 3 && after.join() === before.join(); tries++) {
		const saved = page.waitForResponse(
			(r) => r.url().includes('/card/build/board') && r.request().method() === 'POST'
		);
		await page.getByRole('button', { name: 'Shuffle again' }).click();
		await saved;
		await expect
			.poll(async () => (await squareNames(page)).join(), { timeout: 3000 })
			.not.toBe(after.join())
			.catch(() => {});
		after = await squareNames(page);
	}
	expect(after.join()).not.toBe(before.join());
	expect([...after].sort()).toEqual([...before].sort());
	await expect(page).toHaveURL(/\/card\/build\/board$/);
});

test('Today and the nav lead to the card', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await page.goto('/today');
	// The header says "No card yet" below 1024px; the prompt shows at every width.
	await expect(
		page.getByText("Build this month's card to start checking in.").filter({ visible: true })
	).toBeVisible();
	await page.getByRole('link', { name: 'Build one' }).click();
	await expect(page).toHaveURL(/\/card\/build\/size$/);

	const nav = page.getByRole('navigation', { name: 'Main' });
	await nav.getByRole('link', { name: 'Card' }).click();
	await expect(page).toHaveURL(/\/card$/);
	await expect(page.getByText(/No card for \w+ yet\./)).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Card' })).toHaveAttribute('aria-current', 'page');

	await buildToBoard(page);
	await expect(nav.getByRole('link', { name: 'Card' })).toHaveAttribute('aria-current', 'page');
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);

	await page.goto('/today');
	await page.getByRole('link', { name: /See your \w+ card/ }).click();
	await expect(page).toHaveURL(/\/card$/);
});

test('a draft in progress offers to continue building', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await buildToBoard(page);
	await page.goto('/card');
	await page.getByRole('link', { name: 'Continue building' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
});

test('starting twice makes one card', async ({ page, baseURL }) => {
	await newMemberWithHabits(page, 8);
	await buildToBoard(page);
	const post = () =>
		page.request.post('/card/build/board?/start', {
			headers: { origin: baseURL!, accept: 'text/html' },
			form: {}
		});
	const responses = await Promise.all([post(), post()]);
	for (const response of responses) expect(response.url()).toMatch(/\/card(\?started=1)?$/);
	expect(responses.filter((r) => r.url().endsWith('started=1'))).toHaveLength(1);

	await page.goto('/card');
	expect(await squareNames(page)).toHaveLength(9);
});

test('a habit archived before starting sends you back to Habits', async ({ page, baseURL }) => {
	await newMemberWithHabits(page, 9);
	await buildToBoard(page);
	const name = (await squareNames(page))[0].split(':')[0];

	await page.goto('/me/habits');
	await waitForHydration(page);
	await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
	await expect(page.getByRole('button', { name: `Archive ${name}`, exact: true })).toHaveCount(0);

	const response = await page.request.post('/card/build/board?/start', {
		headers: { origin: baseURL!, accept: 'text/html' },
		form: {}
	});
	expect(response.url()).toContain('/card/build/habits');
	expect(await response.text()).toContain('One of your habits is no longer available.');
	await page.goto('/card/build/board');
	await expect(page).toHaveURL(/\/card\/build\/habits/);
	await page.goto('/card');
	await expect(page.getByText(/No card for \w+ yet\./)).toBeVisible();
});

test('the whole builder works without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await newMemberWithoutJs(page);
	await page.goto('/me/habits?welcome=1');
	for (let i = 1; i <= 8; i++) {
		await page.getByRole('button', { name: /^Add / }).first().click();
		await expect(page.getByRole('button', { name: / added$/ })).toHaveCount(i);
	}

	await page.goto('/card/build');
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: /3×3/ }) })
		.click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	const labels = page.locator('label').filter({ has: page.getByRole('checkbox') });
	for (let i = 0; i < 8; i++) await labels.nth(i).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await page.getByLabel('First bingo').fill('Ice cream');
	await page.getByLabel('5 squares').fill('Movie night');
	await page.getByLabel('Blackout').fill('A weekend away');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await page.getByRole('button', { name: 'Shuffle again' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board/);
	await expect(page.getByRole('button', { name: 'Start card' })).toBeVisible();
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await expect(page.getByText('Card started!')).toBeVisible();
	expect(await squareNames(page)).toHaveLength(9);
	await context.close();
});

test('the welcome panel links to the builder', async ({ page }) => {
	await newMemberWithHabits(page, 1);
	await page.goto('/me/habits?welcome=1');
	await page.getByRole('link', { name: /Build your first card/ }).click();
	await expect(page).toHaveURL(/\/card\/build\/size$/);
});

/** Builds and starts a 3×3 card, ending on /card. */
async function startCard(page: Page): Promise<void> {
	await buildToBoard(page);
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await waitForHydration(page);
}

test('within 48 hours the card can be edited', async ({ page }) => {
	await newMemberWithHabits(page, 9);
	await startCard(page);
	const before = await squareNames(page);

	await page.getByRole('button', { name: 'Edit card' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await waitForHydration(page);
	// Swap one picked habit for the ninth.
	const labels = page.locator('label').filter({ has: page.getByRole('checkbox') });
	const boxes = page.getByRole('checkbox');
	await expect(boxes).toHaveCount(9);
	let off = -1;
	for (let i = 0; i < 9; i++) if (!(await boxes.nth(i).isChecked())) off = i;
	expect(off).toBeGreaterThanOrEqual(0);
	const newName = ((await labels.nth(off).innerText()) ?? '').trim();
	await labels.nth(off === 0 ? 1 : 0).click();
	await labels.nth(off).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await waitForHydration(page);
	await expect(page.getByLabel('First bingo')).toHaveValue('Ice cream');
	await page.getByLabel('First bingo').fill('Pizza night');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await waitForHydration(page);
	await expect(page.getByRole('button', { name: 'Start card' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/\/card\?saved=1$/);
	await expect(page.getByText('Changes saved.')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Rewards' }).getByText('Pizza night')).toBeVisible();
	const after = await squareNames(page);
	expect(after).toHaveLength(9);
	expect(after.join()).not.toBe(before.join());
	expect(newName.length).toBeGreaterThan(0);
	expect(after.some((n) => newName.includes(n.split(':')[0]))).toBe(true);
	await expect(page.getByRole('button', { name: 'Edit card' })).toBeVisible();
});

test('editing shows the card targets and keeps them', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await buildToBoard(page);
	await page.goto('/card/build/targets');
	await waitForHydration(page);
	const first = page.locator('input[name^="target:"]').first();
	const original = Number(await first.inputValue());
	const changed = original === 1 ? 2 : original - 1;
	await first.fill(String(changed));
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await waitForHydration(page);

	await page.getByRole('button', { name: 'Edit card' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await expect(page.locator('input[name^="target:"]').first()).toHaveValue(String(changed));
});

test('cancel editing leaves the card unchanged', async ({ page }) => {
	await newMemberWithHabits(page, 9);
	await startCard(page);
	const before = await squareNames(page);

	await page.getByRole('button', { name: 'Edit card' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/targets$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/rewards$/);
	await waitForHydration(page);
	await page.getByLabel('First bingo').fill('Changed my mind');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/card\/build\/board$/);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Cancel editing' }).click();
	await expect(page).toHaveURL(/\/card$/);
	await expect(page.getByRole('list', { name: 'Rewards' }).getByText('Ice cream')).toBeVisible();
	await expect(page.getByText('Changed my mind')).toHaveCount(0);
	expect(await squareNames(page)).toEqual(before);

	// The draft is gone: the builder goes straight back to the card.
	await page.goto('/card/build/rewards');
	await expect(page).toHaveURL(/\/card$/);
});

test('editing skips the Size step', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await startCard(page);
	await page.getByRole('button', { name: 'Edit card' }).click();
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
	await expect(
		page.getByRole('list', { name: 'Card builder steps' }).getByText('Size')
	).toHaveCount(0);
	await page.goto('/card/build/size');
	await expect(page).toHaveURL(/\/card\/build\/habits$/);
});

test('the test clock moves the app to another month', async ({ page }) => {
	await newMember(page);
	await setClock(page, '2026-11-02T12:00:00Z');
	await page.goto('/card');
	await expect(page.getByText('No card for November yet.')).toBeVisible();
	await setClock(page, '2026-12-02T12:00:00Z');
	await page.goto('/card');
	await expect(page.getByText('No card for December yet.')).toBeVisible();
});

test('5×5 names show on a phone', async ({ page, baseURL }) => {
	test.setTimeout(90_000); // 24 habits plus the whole builder
	await newMember(page);
	await setClock(page, '2026-10-15T12:00:00Z'); // the center is Free before the last week
	// 24 habits with 40-character names, created straight through the form action.
	for (let i = 0; i < 24; i++) {
		// Habit 00 is 40 characters with no spaces, the worst case for wrapping.
		const name =
			i === 0
				? 'Unbroken'.padEnd(40, 'x')
				: `Habit ${String(i).padStart(2, '0')} with a rather long name ok`.slice(0, 40);
		const response = await page.request.post('/me/habits/new', {
			headers: { origin: baseURL!, accept: 'text/html' },
			form: {
				icon: 'flower-lotus',
				name,
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
	await page.setViewportSize({ width: 390, height: 844 });
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
	// A long unspaced name must not widen the picker past the phone (it used to block this tap).
	await expectNoHorizontalScroll(page);
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

	await page.setViewportSize({ width: 360, height: 740 });
	// Review Focus 5: every name shows, long ones stop at two lines, no sideways scrolling.
	const names = page.locator('main [data-label]');
	await expect(names).toHaveCount(24);
	for (const name of await names.all()) await expect(name).toBeVisible();
	const long = names.filter({ hasText: 'Unbrokenxxx' });
	const { height, lineHeight } = await long.evaluate((el) => ({
		// line-clamp clips the box; scrollHeight would still count the hidden lines.
		height: el.clientHeight,
		lineHeight: parseFloat(getComputedStyle(el).lineHeight)
	}));
	expect(height).toBeLessThanOrEqual(Math.ceil(lineHeight * 2));
	// Ordinary words wrap at spaces; only an unspaced run may break anywhere.
	const spaced = await names.filter({ hasText: 'Habit 01' }).evaluate((el) => ({
		wrap: getComputedStyle(el).overflowWrap,
		brk: getComputedStyle(el).wordBreak
	}));
	expect(spaced).toEqual({ wrap: 'anywhere', brk: 'normal' });
	await expectNoHorizontalScroll(page);
});

test('the free square is solid forest', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await setClock(page, '2026-10-15T12:00:00Z'); // the center is Free before the last week
	await buildToBoard(page);
	const free = page.locator('main [role="img"][data-state="free"]');
	await expect(free).toHaveCount(1);
	await expect(free).toHaveCSS('background-color', 'rgb(47, 93, 70)');
	await page.getByRole('button', { name: 'Start card' }).click();
	await expect(page).toHaveURL(/\/card\?started=1$/);
	await expect(page.locator('main [role="img"][data-state="free"]')).toHaveCSS(
		'background-color',
		'rgb(47, 93, 70)'
	);
});
