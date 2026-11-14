import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Notice from './Notice.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>Heads up</span>' }));

describe('Notice', () => {
	it('error is a focusable alert', async () => {
		render(Notice, { tone: 'error', children });
		const alert = page.getByRole('alert');
		await expect.element(alert).toHaveTextContent('Heads up');
		await expect.element(alert).toHaveAttribute('tabindex', '-1');
	});

	it('success is a status', async () => {
		render(Notice, { tone: 'success', children });
		await expect.element(page.getByRole('status')).toHaveTextContent('Heads up');
		expect(page.getByRole('alert').query()).toBeNull();
	});
});
