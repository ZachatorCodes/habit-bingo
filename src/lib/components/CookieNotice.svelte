<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { flyOrFade } from '#lib/components/ui/motion.ts';

	const KEY = 'cookieNoticeDismissed';
	let visible = $state(false);

	// Storage can throw in private modes or with blocked site data; the notice is only informational.
	onMount(() => {
		try {
			visible = localStorage.getItem(KEY) !== '1';
		} catch {
			visible = true;
		}
	});

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			// Nowhere to remember it; the notice shows again next visit.
		}
	}
</script>

{#if visible}
	<div
		role="region"
		aria-label="Cookie notice"
		transition:fly={flyOrFade(24, prefersReducedMotion.current)}
		class="fixed inset-x-4 bottom-[calc(1rem+var(--tab-bar,0px))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm shadow-sheet md:left-[calc(var(--sidebar,0px)+1rem)]"
	>
		<p class="flex-1">We only use essential cookies to keep you signed in.</p>
		<button
			type="button"
			onclick={dismiss}
			class="min-h-11 rounded-full bg-forest px-4 py-1.5 font-extrabold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest"
		>
			Got it
		</button>
	</div>
{/if}

<style>
	/* While the notice floats over the page, keep the last controls reachable above it. */
	:global(html:has([role='region'][aria-label='Cookie notice'])) {
		scroll-padding-bottom: calc(var(--tab-bar, 0px) + 8rem);
	}
	:global(html:has([role='region'][aria-label='Cookie notice']) body) {
		padding-bottom: calc(var(--tab-bar, 0px) + 8rem);
	}
</style>
