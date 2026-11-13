import { expect, test } from '@playwright/test';
import { signIn, uniqueUsername, waitForHydration } from './fixtures.ts';

const MEMBER = { username: 'e2e_member', password: 'e2e member password 1' };
const ADMIN = { username: 'e2e_admin', password: 'e2e admin password 1' };

test('members sign in and reach Today', async ({ page }) => {
	await signIn(page, MEMBER.username, MEMBER.password);
	await expect(page).toHaveURL(/\/today$/);
	// The header says "No card yet" below 1024px; the prompt shows at every width.
	await expect(
		page.getByText("Build this month's card to start checking in.").filter({ visible: true })
	).toBeVisible();
	await expect(page.getByRole('main')).toHaveCount(1);
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/today');
	await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('link', { name: 'Me' })).toHaveAttribute('href', '/me');
	await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('admins see the Admin link', async ({ page }) => {
	await signIn(page, ADMIN.username, ADMIN.password);
	await expect(page).toHaveURL(/\/today$/);
	await expect(
		page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })
	).toHaveAttribute('href', '/admin');
});

test('signed-out visitors are sent to sign in and come back after', async ({ page }) => {
	await page.goto('/me');
	await expect(page).toHaveURL(/\/signin\?next=%2Fme$/);
	await waitForHydration(page);
	await page.getByLabel('Username').fill(MEMBER.username);
	await page.getByLabel('Password').fill(MEMBER.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/me$/);
});

test('the sign-in page offers help and no Google button when Google is off', async ({ page }) => {
	await page.goto('/signin');
	await waitForHydration(page);
	await expect(
		page.getByText('Forgot your password? Ask an admin for a reset link.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('signed-in visitors skip the sign-in page', async ({ page }) => {
	await signIn(page, MEMBER.username, MEMBER.password);
	await expect(page).toHaveURL(/\/today$/);
	await page.goto('/signin');
	await waitForHydration(page);
	await expect(page).toHaveURL(/\/today$/);
});

test('a wrong password shows the generic message and keeps the username', async ({ page }) => {
	const username = uniqueUsername();
	await signIn(page, username, 'not the right password');
	await expect(page.getByRole('alert')).toHaveText(/Wrong username or password\./);
	await expect(page.getByLabel('Username')).toHaveValue(username);
	await expect(page.getByLabel('Password')).toHaveValue('');
	await expect(page).toHaveURL(/\/signin/);
});

test('a copied session cookie stops working after sign out', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	const pageA = await a.newPage();
	await signIn(pageA, MEMBER.username, MEMBER.password);
	await expect(pageA).toHaveURL(/\/today$/);

	await b.addCookies(await a.cookies());
	const pageB = await b.newPage();
	await pageB.goto('/today');
	await expect(pageB).toHaveURL(/\/today$/);

	await pageA.goto('/me');
	await pageA.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(pageA).toHaveURL(/\/$/);

	await pageB.goto('/today');
	await expect(pageB).toHaveURL(/\/signin\?next=%2Ftoday$/);
	await a.close();
	await b.close();
});

for (const next of [
	'//evil.example',
	'/..//evil.example',
	'/.//evil.example',
	'/a/..//evil.example',
	'/%2e%2e//evil.example'
]) {
	test(`open redirects are ignored: ${next}`, async ({ page }) => {
		await page.goto('/signin?next=' + encodeURIComponent(next));
		// The page itself never carries an off-site target, whatever the action does with it.
		await expect(page.locator('form[action="?/signin"] input[name="next"]')).toHaveValue('/today');
		await waitForHydration(page);
		await page.getByLabel('Username').fill(MEMBER.username);
		await page.getByLabel('Password').fill(MEMBER.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/^http:\/\/localhost:4173\/today$/);
	});
}

test('a new account works: sign out and back in', async ({ page, context }) => {
	const username = uniqueUsername();
	const password = 'a long new password 1';
	await page.goto('/join/E2E-OPEN');
	await waitForHydration(page);
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Display name').fill('New Friend');
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);

	// /onboarding (and its Sign out button) arrives in Task 6, so post the sign-out form directly.
	const signOut = await page.request.post('/signout', {
		headers: { origin: 'http://localhost:4173', accept: 'text/html' },
		form: {},
		maxRedirects: 0
	});
	expect(signOut.status()).toBe(303);
	const hasSession = async () =>
		(await context.cookies()).some((c) => c.name.endsWith('hb.session_token'));
	expect(await hasSession()).toBe(false);

	await signIn(page, username, password);
	// Not onboarded yet, so the app sends them on to onboarding, signed in.
	await expect(page).toHaveURL(/\/onboarding$/);
	expect(await hasSession()).toBe(true);
});
