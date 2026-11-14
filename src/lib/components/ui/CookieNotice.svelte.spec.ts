import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CookieNotice from './CookieNotice.svelte';

const message = 'We only use essential cookies to keep you signed in.';

describe('CookieNotice', () => {
	beforeEach(() => localStorage.clear());

	it('shows the notice when it has not been dismissed', async () => {
		render(CookieNotice);
		await expect.element(page.getByText(message)).toBeInTheDocument();
	});

	it('hides and remembers dismissal in localStorage', async () => {
		render(CookieNotice);
		await page.getByRole('button', { name: 'Got it' }).click();
		await expect.element(page.getByText(message)).not.toBeInTheDocument();
		expect(localStorage.getItem('cookieNoticeDismissed')).toBe('1');
	});

	it('stays hidden when already dismissed', async () => {
		localStorage.setItem('cookieNoticeDismissed', '1');
		render(CookieNotice);
		await expect.element(page.getByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
	});
});
