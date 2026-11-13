import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Button from './Button.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Button', () => {
	it('renders a link when href is given', async () => {
		render(Button, { href: '/signin', children: text('Get started') });
		await expect
			.element(page.getByRole('link', { name: 'Get started' }))
			.toHaveAttribute('href', '/signin');
	});

	it('renders a button with type="button" by default', async () => {
		render(Button, { children: text('Save') });
		await expect
			.element(page.getByRole('button', { name: 'Save' }))
			.toHaveAttribute('type', 'button');
	});
});
