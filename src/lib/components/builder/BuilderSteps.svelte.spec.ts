import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BuilderSteps from './BuilderSteps.svelte';

const steps = ['size', 'habits', 'targets', 'rewards', 'board'] as const;

describe('BuilderSteps', () => {
	it('marks the current step and links completed ones', async () => {
		render(BuilderSteps, { steps: [...steps], current: 'habits', completed: ['size'] });
		const list = page.getByRole('list', { name: 'Card builder steps' });
		await expect.element(list).toBeInTheDocument();
		expect(page.getByRole('listitem').elements()).toHaveLength(5);
		await expect
			.element(page.getByRole('link', { name: /Size/ }))
			.toHaveAttribute('href', '/card/build/size');
		const current = page.getByText('Habits', { exact: true });
		await expect.element(current).toBeInTheDocument();
		expect(page.getByRole('link').elements()).toHaveLength(1);
		await expect.element(page.getByText('Step 2 of 5')).toBeInTheDocument();
		const marked = page
			.getByRole('listitem')
			.elements()
			.filter((li) => li.getAttribute('aria-current') === 'step');
		expect(marked).toHaveLength(1);
		expect(marked[0].textContent).toContain('Habits');
	});

	it('counts steps without size when editing', async () => {
		render(BuilderSteps, {
			steps: ['habits', 'targets', 'rewards', 'board'],
			current: 'habits',
			completed: []
		});
		await expect.element(page.getByText('Step 1 of 4')).toBeInTheDocument();
		expect(page.getByRole('listitem').elements()).toHaveLength(4);
	});
});
