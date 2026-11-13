import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TextField from './TextField.svelte';

describe('TextField', () => {
	it('labels the input and keeps its name, type and value', async () => {
		render(TextField, {
			label: 'Password',
			name: 'password',
			type: 'password',
			value: 'hunter2',
			autocomplete: 'new-password'
		});
		const input = page.getByLabelText('Password');
		await expect.element(input).toHaveAttribute('name', 'password');
		await expect.element(input).toHaveAttribute('type', 'password');
		await expect.element(input).toHaveAttribute('autocomplete', 'new-password');
		await expect.element(input).toHaveValue('hunter2');
	});

	it('is a valid text input by default', async () => {
		render(TextField, { label: 'Username', name: 'username' });
		const input = page.getByRole('textbox', { name: 'Username' });
		await expect.element(input).toHaveAttribute('type', 'text');
		await expect.element(input).not.toHaveAttribute('aria-invalid');
		await expect.element(input).not.toHaveAttribute('aria-describedby');
	});

	it('links its error to the input', async () => {
		render(TextField, { label: 'Username', name: 'username', error: 'That username is taken.' });
		const input = page.getByRole('textbox', { name: 'Username' });
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(input).toHaveAccessibleDescription('That username is taken.');
	});

	it('describes the input with its hint and error together', async () => {
		render(TextField, {
			label: 'Username',
			name: 'username',
			hint: 'Letters, numbers and underscores.',
			error: 'That username is taken.'
		});
		await expect
			.element(page.getByRole('textbox', { name: 'Username' }))
			.toHaveAccessibleDescription('Letters, numbers and underscores. That username is taken.');
	});

	it('gives each field its own ids', async () => {
		render(TextField, { label: 'First', name: 'a', error: 'Bad first.' });
		render(TextField, { label: 'Second', name: 'b', error: 'Bad second.' });
		await expect
			.element(page.getByRole('textbox', { name: 'Second' }))
			.toHaveAccessibleDescription('Bad second.');
	});

	it('can be a number input with bounds', async () => {
		render(TextField, {
			label: 'Max uses',
			name: 'maxUses',
			type: 'number',
			value: 1,
			min: 1,
			max: 50
		});
		const input = page.getByRole('spinbutton', { name: 'Max uses' });
		await expect.element(input).toHaveAttribute('min', '1');
		await expect.element(input).toHaveAttribute('max', '50');
		await expect.element(input).toHaveValue(1);
	});
});
