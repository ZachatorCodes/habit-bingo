import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IconPicker from './IconPicker.svelte';

describe('IconPicker', () => {
	it('posts the checked icon as a native radio', () => {
		const { container } = render(IconPicker, {
			name: 'icon',
			value: 'leaf',
			options: ['leaf', 'drop']
		});
		const checked = container.querySelector('input[type=radio]:checked') as HTMLInputElement;
		expect(checked.name).toBe('icon');
		expect(checked.value).toBe('leaf');
	});

	it('does not offer the reserved lock icon by default', () => {
		render(IconPicker, { name: 'icon', value: '' });
		expect(page.getByRole('radio', { name: 'Book', exact: true }).elements()).toHaveLength(1);
		expect(page.getByRole('radio', { name: 'Private' }).elements()).toHaveLength(0);
	});

	it('names each option by its label', async () => {
		render(IconPicker, { name: 'icon', value: '', options: ['book-open'] });
		await expect.element(page.getByRole('radio', { name: 'Book' })).toBeInTheDocument();
	});

	it('links the error to the group', async () => {
		render(IconPicker, { name: 'icon', value: '', error: 'Pick an icon.' });
		const group = page.getByRole('radiogroup').element();
		expect(group.getAttribute('aria-invalid')).toBe('true');
		await expect.element(page.getByText('Pick an icon.')).toBeVisible();
	});

	it('shows category subheadings when grouped', async () => {
		render(IconPicker, { name: 'icon', value: '', options: ['leaf', 'drop'], groups: true });
		await expect.element(page.getByText('Mind')).toBeVisible();
		await expect.element(page.getByText('Health')).toBeVisible();
	});

	it('arrow key moves the selection', async () => {
		render(IconPicker, { name: 'icon', value: 'leaf', options: ['leaf', 'drop', 'brain'] });
		(page.getByRole('radio', { name: 'Leaf' }).element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(page.getByRole('radio', { name: 'Drop' })).toBeChecked();
	});
});
