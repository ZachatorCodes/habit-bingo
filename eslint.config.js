import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	},
	// Layer boundaries (docs/adr/0007-layering-and-boundaries.md).
	{
		files: ['src/lib/game/**'],
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$app/*', '@sveltejs/kit', '@sveltejs/kit/*', 'drizzle-orm', 'drizzle-orm/*'],
							message: 'lib/game is pure: no SvelteKit or database imports.'
						},
						{
							group: [
								'#lib/server',
								'#lib/server/*',
								'$lib/server',
								'$lib/server/*',
								'**/server/**'
							],
							message: 'lib/game may not import lib/server.'
						},
						{
							group: ['#lib/components/*', '$lib/components/*', '**/components/**', '*.svelte'],
							message: 'lib/game may not import components.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/lib/components/**'],
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'#lib/server',
								'#lib/server/*',
								'$lib/server',
								'$lib/server/*',
								'**/server/**'
							],
							message:
								'Components may not import lib/server; shared types live in lib/game/types.ts.'
						}
					]
				}
			]
		}
	}
);
