import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Hero from './Hero.svelte';

describe('Hero', () => {
	it('renders the title as the page heading and the summary', () => {
		const { container } = render(Hero, {
			title: 'Good morning, Zach',
			summary: '3 things to do today'
		});
		expect(container.querySelector('h1')!.textContent).toBe('Good morning, Zach');
		expect(container.textContent).toContain('3 things to do today');
	});
});
