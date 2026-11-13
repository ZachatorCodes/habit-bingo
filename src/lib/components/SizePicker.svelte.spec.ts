import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SizePicker from './SizePicker.svelte';

describe('SizePicker', () => {
	it('shows need versus have and how many to add', async () => {
		render(SizePicker, { selected: null, habitCount: 8 });
		expect(page.getByRole('radio').elements()).toHaveLength(2);
		await expect.element(page.getByText('8 habits', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('24 habits', { exact: true })).toBeInTheDocument();
		expect(page.getByText(/× points/).elements()).toHaveLength(0);
		await expect.element(page.getByText('You have 8 habits / need 8')).toBeInTheDocument();
		await expect.element(page.getByText('You have 8 habits / need 24')).toBeInTheDocument();
		await expect.element(page.getByText('Add 16 more in the next step.')).toBeInTheDocument();
		expect(page.getByText(/more in the next step/).elements()).toHaveLength(1);
	});

	it('checks the selected size and posts it as "size"', async () => {
		render(SizePicker, { selected: 5, habitCount: 30 });
		await expect.element(page.getByRole('radio', { name: /5×5/ })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: /3×3/ })).not.toBeChecked();
		await expect.element(page.getByRole('radio', { name: /5×5/ })).toHaveAttribute('name', 'size');
		await expect.element(page.getByRole('radio', { name: /5×5/ })).toHaveAttribute('value', '5');
	});

	it('puts a check icon in each option, shown when checked', async () => {
		render(SizePicker, { selected: 5, habitCount: 30 });
		for (const radio of page.getByRole('radio').elements()) {
			const icon = radio.closest('label')?.querySelector('svg');
			expect(icon).not.toBeNull();
			expect(icon?.getAttribute('class')).toContain('group-has-[:checked]:block');
		}
	});

	it('links an error to the size group', async () => {
		render(SizePicker, { selected: null, habitCount: 9, errorId: 'problem' });
		const group = page.getByRole('radiogroup', { name: 'Card size' });
		await expect.element(group).toHaveAttribute('aria-invalid', 'true');
		await expect.element(group).toHaveAttribute('aria-describedby', 'problem');
	});
});
