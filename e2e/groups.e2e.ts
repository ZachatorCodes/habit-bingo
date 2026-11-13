import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	newMember,
	signIn,
	newMemberWithHabits,
	startCard,
	uniqueUsername,
	waitForHydration
} from './fixtures.ts';

/** A second person in their own browser context. */
async function otherPerson(browser: Browser): Promise<Page> {
	return (await browser.newContext()).newPage();
}

/** Creates "Climbers" and returns the group page URL path and its invite link. */
async function createClimbers(page: Page): Promise<{ groupPath: string; link: string }> {
	await page.goto('/groups/new');
	await waitForHydration(page);
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: 'Mountains', exact: true }) })
		.click();
	await page.getByRole('textbox', { name: 'Name' }).fill('Climbers');
	await page.getByRole('button', { name: 'Create group' }).click();
	await expect(page.getByRole('heading', { level: 1, name: /Climbers/ })).toBeVisible();
	const groupPath = new URL(page.url()).pathname;
	await page.goto(`${groupPath}?tab=members`);
	const link = await page.getByRole('textbox', { name: 'Invite link' }).inputValue();
	return { groupPath, link };
}

/** B joins through the link, as an existing signed-in account. */
async function join(page: Page, link: string): Promise<void> {
	await page.goto(link);
	await waitForHydration(page);
	await expect(page.getByRole('heading', { level: 1, name: 'Join Climbers' })).toBeVisible();
	await page.getByRole('button', { name: 'Join', exact: true }).click();
	await expect(page).toHaveURL(/\/groups\/[^/]+$/);
}

test('a group gets a member through its link', async ({ page, browser }) => {
	const a = await newMember(page);
	const { groupPath, link } = await createClimbers(page);

	const pageB = await otherPerson(browser);
	const b = await newMember(pageB);
	await join(pageB, link);
	await expect(pageB.getByRole('heading', { level: 1, name: /Climbers/ })).toBeVisible();
	await pageB.goto(`${groupPath}?tab=leaderboard`);
	await expect(pageB.getByRole('link', { name: 'All-time' })).toHaveCount(0);
	await expect(pageB.getByRole('link', { name: `@${b.username} (you)` })).toBeVisible();
	await expect(
		pageB.getByRole('region', { name: 'Leaderboard' }).getByText(`@${a.username}`)
	).toBeVisible();

	await page.goto(`${groupPath}?tab=leaderboard`);
	await expect(
		page.getByRole('region', { name: 'Leaderboard' }).getByText(`@${b.username}`)
	).toBeVisible();
	await expect(page.getByRole('link', { name: `@${a.username} (you)` })).toBeVisible();
	await pageB.context().close();
});

test("a member's card hides private habits", async ({ page, browser }) => {
	await newMember(page);
	const { link } = await createClimbers(page);

	const pageB = await otherPerson(browser);
	const b = await newMemberWithHabits(pageB, 7);
	await pageB.goto('/me/habits/new');
	await waitForHydration(pageB);
	await pageB
		.locator('label')
		.filter({ has: pageB.getByRole('radio', { name: 'Moon', exact: true }) })
		.click();
	await pageB.getByRole('textbox', { name: 'Name' }).fill('Secret stretch');
	await pageB
		.locator('label')
		.filter({ has: pageB.getByRole('radio', { name: /Mind/ }) })
		.click();
	await pageB.getByRole('checkbox', { name: /Private/ }).check();
	await pageB.getByRole('button', { name: 'Add habit' }).click();
	await expect(pageB).toHaveURL(/\/me\/habits\?/);
	await startCard(pageB);
	await expect(pageB.getByText('Secret stretch').first()).toBeVisible();
	await join(pageB, link);

	await page.goto('/groups');
	await page.getByRole('link', { name: /Climbers/ }).click();
	await page.waitForURL(/\/groups\/[^/]+$/);
	await page.goto(`${new URL(page.url()).pathname}?tab=leaderboard`);
	await page
		.getByRole('region', { name: 'Leaderboard' })
		.getByRole('link', { name: new RegExp(`@${b.username}`) })
		.click();
	await expect(
		page.getByRole('heading', { level: 1, name: new RegExp(`@${b.username}`) })
	).toBeVisible();
	await expect(page.getByRole('img', { name: /^Private:/ }).first()).toBeVisible();
	await expect(page.getByText('Secret stretch')).toHaveCount(0);
	await expect(page.locator('body')).not.toContainText('Secret stretch');
	await pageB.context().close();
});

test('a new person signs up through a group link', async ({ page, browser }) => {
	await newMember(page);
	const { link } = await createClimbers(page);

	const pageC = await otherPerson(browser);
	await pageC.goto(link);
	await waitForHydration(pageC);
	await pageC.getByLabel('Username').fill(uniqueUsername());
	await pageC.getByLabel('Display name').fill('Newcomer');
	await pageC.getByLabel('Password').fill('a long new password 1');
	await pageC.getByRole('button', { name: 'Create account' }).click();
	await pageC.waitForURL(/\/onboarding$/);
	await waitForHydration(pageC);
	await pageC.getByRole('button', { name: "Let's go" }).click();
	await pageC.waitForURL((url) => !url.pathname.startsWith('/onboarding'));

	await pageC.goto('/groups');
	await expect(pageC.getByRole('link', { name: /Climbers/ })).toBeVisible();
	await pageC.context().close();
});

test('the owner leaves and the other member becomes owner', async ({ page, browser }) => {
	await newMember(page);
	const { groupPath, link } = await createClimbers(page);

	const pageB = await otherPerson(browser);
	const b = await newMember(pageB);
	await join(pageB, link);

	await page.goto(`${groupPath}?tab=members`);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Leave group' }).click();
	await expect(page.getByRole('dialog')).toContainText(`Ownership passes to @${b.username}.`);
	await page.getByRole('dialog').getByRole('button', { name: 'Leave group' }).click();
	await expect(page).toHaveURL(/\/groups$/);

	await pageB.goto(`${groupPath}?tab=members`);
	await expect(
		pageB
			.getByRole('region', { name: 'Members' })
			.getByRole('listitem')
			.filter({ hasText: `@${b.username}` })
	).toContainText('Owner');
	await pageB.context().close();
});

test('strangers get a 404', async ({ page, browser }) => {
	await newMember(page);
	const { groupPath, link } = await createClimbers(page);

	const pageB = await otherPerson(browser);
	await newMember(pageB);
	await join(pageB, link);
	await pageB.goto(`${groupPath}?tab=leaderboard`);
	const cardPath = new URL(
		(await pageB.getByRole('link', { name: /\(you\)/ }).getAttribute('href'))!,
		pageB.url()
	).pathname;

	const pageC = await otherPerson(browser);
	await newMember(pageC);
	expect((await pageC.goto(groupPath))?.status()).toBe(404);
	expect((await pageC.goto(cardPath))?.status()).toBe(404);
	await pageB.context().close();
	await pageC.context().close();
});

test('the leaderboard is this month only and shows % complete', async ({ page }) => {
	await newMemberWithHabits(page, 8);
	await startCard(page);
	const { groupPath } = await createClimbers(page);
	await page.goto(`${groupPath}?tab=leaderboard`);
	await expect(page.getByRole('link', { name: 'This month' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'All-time' })).toHaveCount(0);
	const board = page.getByRole('region', { name: 'Leaderboard' });
	await expect(board.getByText(/^\d+% · \d+ lines?$/)).toBeVisible();
	await expect(board.getByText(/\bpts\b|\bpoints?\b/)).toHaveCount(0);
});

test('an admin deletes a group link; the owner resets it', async ({ page, browser }) => {
	await newMember(page);
	const { groupPath, link } = await createClimbers(page);
	const code = link.split('/').pop()!;

	const admin = await otherPerson(browser);
	await signIn(admin, 'e2e_admin', 'e2e admin password 1');
	await expect(admin).toHaveURL(/\/today$/);
	await admin.goto('/admin');
	await waitForHydration(admin);
	const row = admin
		.getByRole('list', { name: 'Invites' })
		.getByRole('listitem')
		.filter({ hasText: code });
	await expect(row).toContainText('Climbers');
	await row.getByRole('button', { name: 'Delete' }).click();
	await admin.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(admin.getByText('Invite deleted.')).toBeVisible();

	await page.goto(`${groupPath}?tab=members`);
	await waitForHydration(page);
	await expect(page.getByText('No invite link.')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Reset link' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Reset link' }).click();
	const fresh = await page.getByRole('textbox', { name: 'Invite link' }).inputValue();
	expect(fresh).not.toBe(link);
	await page.goto(fresh);
	await expect(page.getByRole('heading', { level: 1, name: /Climbers/ })).toBeVisible();
	await admin.context().close();
});

test('the owner renames the group and changes its icon; a member cannot', async ({
	page,
	browser
}) => {
	await newMember(page);
	const { groupPath, link } = await createClimbers(page);
	await page.goto(`${groupPath}?tab=members`);
	await page.getByRole('link', { name: 'Edit group' }).click();
	await expect(page).toHaveURL(new RegExp(`${groupPath}/edit$`));
	await waitForHydration(page);
	await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Climbers');
	await page.getByRole('textbox', { name: 'Name' }).fill('Boulderers');
	await page
		.locator('label')
		.filter({ has: page.getByRole('radio', { name: 'Rocket', exact: true }) })
		.click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(new RegExp(`${groupPath}[?]updated=1$`));
	await expect(page.getByRole('heading', { level: 1, name: /Boulderers/ })).toBeVisible();
	await expect(page.getByText('Group updated.')).toBeVisible();
	await page.goto('/groups');
	await expect(page.getByRole('link', { name: /Boulderers/ })).toBeVisible();

	const pageB = await otherPerson(browser);
	await newMember(pageB);
	await pageB.goto(link);
	await waitForHydration(pageB);
	await pageB.getByRole('button', { name: 'Join', exact: true }).click();
	await expect(pageB).toHaveURL(/\/groups\/[^/]+$/);
	await pageB.goto(`${groupPath}?tab=members`);
	await expect(pageB.getByRole('link', { name: 'Edit group' })).toHaveCount(0);
	const response = await pageB.goto(`${groupPath}/edit`);
	expect(response?.status()).toBe(404);
	await pageB.context().close();
});
