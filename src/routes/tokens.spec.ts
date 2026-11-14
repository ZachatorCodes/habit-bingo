import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text is WCAG AA 4.5:1 and state rings or icons are 3:1 (WCAG 1.4.11), so the state cues stand out
// from the page and from their own fill.
const css = readFileSync('src/routes/layout.css', 'utf8');
const token = (name: string) => {
	const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
	if (!match) throw new Error(`no --color-${name}`);
	return match[1];
};
const luminance = (hex: string) => {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

describe('garden colour tokens', () => {
	it.each([
		['ink', 'page'],
		['ink', 'surface'],
		['muted', 'page'],
		['muted', 'surface'],
		['ink', 'earned-tile'],
		['ink', 'protected-tile'],
		['ink', 'risk-tile']
	])('%s text on %s meets 4.5:1', (fg, bg) =>
		expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
	);
	it('white on forest meets 4.5:1', () =>
		expect(contrast('#ffffff', token('forest'))).toBeGreaterThanOrEqual(4.5));
	it.each([
		['forest', 'earned-tile'],
		['protected-ring', 'protected-tile'],
		['terracotta', 'risk-tile'],
		['lost-ring', 'page'],
		['forest', 'surface']
	])('%s ring on %s meets 3:1', (ring, bg) =>
		expect(contrast(token(ring), token(bg))).toBeGreaterThanOrEqual(3)
	);
	it('white icon on terracotta meets 3:1', () =>
		expect(contrast('#ffffff', token('terracotta'))).toBeGreaterThanOrEqual(3));
});

describe('alias tokens', () => {
	const files = (readdirSync('src', { recursive: true, encoding: 'utf8' }) as string[])
		.filter((f) => f.endsWith('.svelte'))
		.map((f) => join('src', f));
	const alias =
		/\b(?:bg|text|border|ring|outline|fill|stroke|shadow|from|to)-(?:cream|accent(?:-edge)?|earn(?:-edge|-shadow)?|protect(?:-edge|-shadow)?|risk(?:-edge|-shadow)?|lost)\b(?!-)/;
	it('no alias token classes remain', () =>
		expect(files.filter((f) => alias.test(readFileSync(f, 'utf8')))).toEqual([]));
	it('layout.css drops the alias colours', () => expect(css).not.toContain('--color-cream'));
});
