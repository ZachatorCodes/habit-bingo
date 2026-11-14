<script lang="ts">
	import './layout.css';
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import CookieNotice from '#lib/components/ui/CookieNotice.svelte';
	import SiteFooter from '#lib/components/ui/SiteFooter.svelte';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Signed-in pages render their own <main> and tab bar.
	// Error pages render in this layout only, so they always get this <main>.
	const ownsMain = $derived(!page.error && (page.route.id?.startsWith('/(app)') ?? false));

	// Lets E2E tests wait until enhanced forms are wired up before submitting.
	onMount(() => {
		document.documentElement.dataset.hydrated = 'true';
	});
</script>

<svelte:head>
	{#if !dev}
		<!-- Vercel Web Analytics: cookieless, served from our own origin (ADR 0006, spec §5.5). -->
		<script defer src="/_vercel/insights/script.js"></script>
	{/if}
</svelte:head>

<div class="flex min-h-dvh flex-col">
	{#if ownsMain}
		{@render children()}
	{:else}
		<main class="flex-1">
			{@render children()}
		</main>
	{/if}
	{#if !ownsMain}
		<SiteFooter />
	{/if}
</div>
<CookieNotice />
