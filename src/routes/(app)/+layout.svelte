<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** True on the page itself and, for `under`, anywhere beneath it. */
	const active = (href: string, under = false) =>
		page.url.pathname === href || (under && page.url.pathname.startsWith(`${href}/`));
	const current = (href: string, under = false) => (active(href, under) ? 'page' : undefined);
</script>

<nav aria-label="Main" class="bar">
	<div class="mark hidden items-center gap-2 md:flex">
		<Icon name="target" size={28} /><span class="hidden text-lg font-extrabold lg:inline"
			>Habit Bingo</span
		>
	</div>
	<a href={resolve('/(app)/today')} aria-current={current('/today')} class="tab"
		><Icon name="sun-horizon" size={26} /><span class="label md:sr-only lg:not-sr-only">Today</span
		></a
	>
	<a href={resolve('/(app)/card')} aria-current={current('/card', true)} class="tab"
		><Icon name="grid-nine" size={26} /><span class="label md:sr-only lg:not-sr-only">Card</span></a
	>
	<a href={resolve('/(app)/groups')} aria-current={current('/groups', true)} class="tab"
		><Icon name="users-three" size={26} /><span class="label md:sr-only lg:not-sr-only">Groups</span
		></a
	>
	<a href={resolve('/(app)/me')} aria-current={current('/me', true)} class="tab"
		><Icon name="user-circle" size={26} /><span class="label md:sr-only lg:not-sr-only">Me</span></a
	>
	{#if data.user.isAdmin}
		<a href={resolve('/(app)/admin')} aria-current={current('/admin')} class="tab"
			><Icon name="shield-check" size={26} /><span class="label md:sr-only lg:not-sr-only"
				>Admin</span
			></a
		>
	{/if}
</nav>

<main class="flex-1 md:ml-[var(--sidebar)]">
	<!-- `app-shell` lets the page header line up with full-width panels here, not on public pages. -->
	<div class="app-shell lg:mx-auto lg:max-w-[1200px]">
		{@render children()}
	</div>
</main>

<style>
	.tab:focus-visible {
		outline: 3px solid var(--color-forest);
		outline-offset: 2px;
	}
	.label {
		font-size: 0.75rem; /* 12px */
		font-weight: 800;
		line-height: 1;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
			background-color 120ms ease-out,
			border-color 120ms ease-out;
		flex: 1;
		max-width: 104px;
		height: 64px;
		border: 1px solid var(--color-line);
		border-bottom: 0;
		border-radius: 16px 16px 0 0;
		background: var(--color-surface);
		color: var(--color-ink);
	}
	/* --tab-bar also lifts the cookie notice above the tabs, and keeps scrolled-to controls clear of them.
	   Scoped with :has() so the values never outlive this layout after client-side navigation. */
	:global(html:has(nav[aria-label='Main'])) {
		--tab-bar: calc(76px + var(--safe-bottom));
		--sidebar: 0px;
		scroll-padding-bottom: var(--tab-bar);
	}
	:global(html:has(nav[aria-label='Main']) body) {
		padding-bottom: var(--tab-bar);
	}
	@media (min-width: 768px) {
		:global(html:has(nav[aria-label='Main'])) {
			--tab-bar: 0px;
			--sidebar: 72px;
		}
	}
	@media (min-width: 1024px) {
		:global(html:has(nav[aria-label='Main'])) {
			--sidebar: 220px;
		}
	}
	.bar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 40;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 6px;
		padding: 0 12px var(--safe-bottom);
		border-top: 1px solid var(--color-line);
		background: var(--color-surface);
	}
	@media (hover: hover) and (max-width: 767px) {
		.tab:hover {
			transform: translateY(-4px);
			border-color: var(--color-leaf);
		}
	}
	@media (max-width: 767px) {
		.tab[aria-current='page'] {
			transform: translateY(-8px);
			border-color: var(--color-forest);
			background: var(--color-page);
			color: var(--color-forest);
		}
	}
	@media (min-width: 768px) {
		.bar {
			inset: 0 auto 0 0;
			width: var(--sidebar);
			flex-direction: column;
			align-items: stretch;
			justify-content: flex-start;
			gap: 4px;
			padding: calc(var(--safe-top) + 12px) 12px var(--safe-bottom)
				calc(12px + env(safe-area-inset-left));
			border-top: 0;
			border-right: 1px solid var(--color-line);
			color: var(--color-forest);
		}
		.mark {
			min-height: 44px;
			margin-bottom: 8px;
			padding: 0 10px;
			justify-content: center;
		}
		.tab {
			flex: none;
			flex-direction: row;
			justify-content: center;
			gap: 12px;
			min-height: 44px;
			max-width: none;
			height: auto;
			padding: 0 10px;
			border: 0;
			border-radius: 12px;
		}
		.label {
			font-size: 0.9375rem;
		}
		.tab[aria-current='page'] {
			background: var(--color-forest);
			color: #fff;
		}
		@media (hover: hover) {
			.tab:not([aria-current='page']):hover {
				background: var(--color-page);
			}
		}
	}
	@media (min-width: 1024px) {
		.tab,
		.mark {
			justify-content: flex-start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tab {
			transition: none;
		}
	}
</style>
