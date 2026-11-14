import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CopyField from './CopyField.svelte';

const props = {
	label: 'New invite link',
	value: 'https://example.test/join/abc',
	copyLabel: 'Copy invite link'
};

describe('CopyField', () => {
	afterEach(() => vi.restoreAllMocks());

	it('shows the value as selectable, read-only text', async () => {
		render(CopyField, props);
		const input = page.getByLabelText('New invite link');
		await expect.element(input).toHaveValue(props.value);
		await expect.element(input).toHaveAttribute('readonly');
	});

	it('copies the value and confirms it', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		render(CopyField, props);
		await page.getByRole('button', { name: 'Copy invite link' }).click();
		expect(writeText).toHaveBeenCalledWith(props.value);
		await expect.element(page.getByRole('status')).toHaveTextContent('Copied.');
	});

	it('says so when copying fails', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		render(CopyField, props);
		await page.getByRole('button', { name: 'Copy invite link' }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent("Couldn't copy. Select the link and copy it yourself.");
	});
});
