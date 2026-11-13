import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

const body = createRawSnippet(() => ({ render: () => '<p>Sheet body</p>' }));

describe('Sheet', () => {
	it('opens as a modal dialog named by its title', async () => {
		render(Sheet, { title: 'Go biking', onclose: () => {}, children: body });
		const dialog = page.getByRole('dialog', { name: 'Go biking' });
		await expect.element(dialog).toBeVisible();
		expect(dialog.element().hasAttribute('open')).toBe(true);
		await expect.element(page.getByText('Sheet body')).toBeVisible();
	});

	it('pads its bottom for the home indicator', async () => {
		document.documentElement.style.setProperty('--safe-bottom', '34px');
		render(Sheet, { title: 'Go biking', onclose: () => {}, children: body });
		const panel = page.getByRole('dialog').element().firstElementChild as HTMLElement;
		expect(getComputedStyle(panel).paddingBottom).toBe('54px');
		document.documentElement.style.removeProperty('--safe-bottom');
	});
	it('closes with the Close button and with Escape', async () => {
		const onclose = vi.fn();
		render(Sheet, { title: 'Go biking', onclose, children: body });
		await page.getByRole('button', { name: 'Close' }).click();
		expect(onclose).toHaveBeenCalledTimes(1);
		await userEvent.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalledTimes(2);
	});

	it('returns focus to what opened it', async () => {
		const opener = document.createElement('button');
		opener.textContent = 'Opener';
		document.body.append(opener);
		opener.focus();
		const screen = render(Sheet, { title: 'Go biking', onclose: () => {}, children: body });
		await expect.element(page.getByRole('dialog')).toBeVisible();
		screen.unmount();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});

	it('locks page scroll while open', async () => {
		const screen = render(Sheet, { title: 'Go biking', onclose: () => {}, children: body });
		await expect.element(page.getByRole('dialog')).toBeVisible();
		expect(getComputedStyle(document.documentElement).overflow).toBe('hidden');
		screen.unmount();
		expect(getComputedStyle(document.documentElement).overflow).toBe('visible');
	});

	it('does not lock page scroll at md and up', async () => {
		const original = window.matchMedia;
		window.matchMedia = ((query: string) =>
			({
				matches: query.includes('min-width: 768px'),
				media: query
			}) as MediaQueryList) as typeof window.matchMedia;
		const screen = render(Sheet, { title: 'Go biking', onclose: () => {}, children: body });
		await expect.element(page.getByRole('dialog')).toBeVisible();
		expect(document.documentElement.style.overflow).not.toBe('hidden');
		screen.unmount();
		window.matchMedia = original;
	});
});
