import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BingoSquare from './BingoSquare.svelte';

describe('BingoSquare', () => {
	it('names the habit and state for screen readers', async () => {
		render(BingoSquare, { icon: 'book-open', label: 'Finish a book', state: 'complete' });
		await expect
			.element(page.getByRole('img', { name: 'Finish a book: complete' }))
			.toBeInTheDocument();
	});

	it('large squares use the big ring and a big Free label; compact wins', async () => {
		const big = render(BingoSquare, {
			icon: 'bicycle',
			label: 'Bike',
			state: 'empty',
			large: true
		});
		expect(big.container.querySelector('[style*="width: 56px"]')).not.toBeNull();
		const free = render(BingoSquare, { icon: 'star', label: 'Free', state: 'free', large: true });
		expect(free.container.querySelector('span.text-lg')?.textContent).toBe('Free');
		const both = render(BingoSquare, {
			icon: 'bicycle',
			label: 'Bike',
			state: 'empty',
			large: true,
			compact: true
		});
		expect(both.container.querySelector('[style*="width: 32px"]')).not.toBeNull();
	});

	it('draws the icon as an svg, falling back for unknown names', async () => {
		const { container } = render(BingoSquare, { icon: 'bicycle', label: 'Bike', state: 'empty' });
		expect(container.querySelector('svg')).not.toBeNull();
		const unknown = render(BingoSquare, { icon: 'nope', label: 'Odd', state: 'empty' });
		expect(unknown.container.querySelector('svg')).not.toBeNull();
	});

	it.each([
		['empty', 'open'],
		['inProgress', 'progress'],
		['complete', 'earned'],
		['held', 'protected'],
		['atRisk', 'risk'],
		['lost', 'lost']
	] as const)('%s renders the %s ring', (state, variant) => {
		const c = render(BingoSquare, { icon: 'drop', label: 'Water', state }).container;
		expect(c.querySelector('[data-variant]')!.getAttribute('data-variant')).toBe(variant);
	});

	it('announces name and state, ring hidden', async () => {
		render(BingoSquare, { icon: 'drop', label: 'Water', state: 'held' });
		await expect.element(page.getByRole('img', { name: 'Water: protected' })).toBeInTheDocument();
	});

	it('free shows "Free" and no ring', () => {
		const c = render(BingoSquare, { icon: 'drop', label: 'Free', state: 'free' }).container;
		expect(c.textContent).toContain('Free');
		expect(c.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Free');
		expect(c.querySelector('[data-variant]')).toBeNull();
	});

	it('buildNext shows the rocket and "Next month"', () => {
		const c = render(BingoSquare, { icon: 'x', label: 'Build', state: 'buildNext' }).container;
		expect(c.textContent).toContain('Next month');
		expect(c.querySelector('svg')).not.toBeNull();
	});

	it('always shows the name, struck through when lost', async () => {
		render(BingoSquare, { icon: 'bicycle', label: 'Go biking', state: 'lost' });
		const name = page.getByText('Go biking').element();
		expect(name.className).toContain('line-through');
	});

	it('compact squares show the name at every width', async () => {
		render(BingoSquare, { icon: 'bicycle', label: 'Go biking', state: 'held', compact: true });
		const name = page.getByText('Go biking').element();
		expect(name.className).not.toMatch(/(^|\s)hidden(\s|$)/);
		expect(name.className).toContain('wrap-anywhere');
	});

	it('compact squares clamp the name to two lines', async () => {
		render(BingoSquare, {
			icon: 'bicycle',
			label: 'A very long habit name that keeps going',
			state: 'held',
			compact: true
		});
		expect(page.getByText(/A very long habit name/).element().className).toContain('line-clamp-2');
	});

	it('pops only on a real change to complete, not on first render', async () => {
		const first = render(BingoSquare, { icon: 'drop', label: 'Water', state: 'complete' });
		await new Promise((r) => setTimeout(r, 20));
		expect(first.container.querySelector('[data-state]')!.classList.contains('pop')).toBe(false);
		const c = render(BingoSquare, { icon: 'drop', label: 'Tea', state: 'inProgress' });
		await c.rerender({ state: 'complete' });
		await expect.poll(() => c.container.querySelector('.pop')).not.toBeNull();
	});
});
