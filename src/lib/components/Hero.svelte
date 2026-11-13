<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		summary?: string;
		/** False hides the summary from 1024px up (Today shows that context beside its list). */
		wideSummary?: boolean;
		children?: Snippet;
	};
	let { title, summary, wideSummary = true, children }: Props = $props();
</script>

<!-- Bottom padding leaves room for the following sheet to overlap by 18px (-mt-[18px] on the sheet). -->
<header
	class="relative overflow-hidden bg-forest px-5 pt-[calc(2rem+var(--safe-top))] pb-12 text-surface md:m-4 md:rounded-[24px] lg:mx-0 lg:px-8 lg:pb-10"
>
	<svg
		aria-hidden="true"
		viewBox="0 0 80 80"
		class="drift pointer-events-none absolute -top-4 -right-3 size-28 text-leaf"
	>
		<path d="M10 70C10 30 40 8 72 8c0 36-20 62-62 62Z" fill="currentColor" />
	</svg>
	<svg
		aria-hidden="true"
		viewBox="0 0 80 80"
		class="drift-slow pointer-events-none absolute right-16 -bottom-6 size-20 text-leaf-2"
	>
		<path d="M70 70C70 36 46 14 14 14c0 34 18 56 56 56Z" fill="currentColor" />
	</svg>
	<div class="relative">
		<h1 class="text-[28px] leading-tight font-extrabold break-words lg:text-[40px]">{title}</h1>
		{#if summary}
			<p class={['mt-1 text-[15px] font-semibold', !wideSummary && 'lg:hidden']}>{summary}</p>
		{/if}
		{@render children?.()}
	</div>
</header>

<style>
	@keyframes drift {
		from {
			transform: translate(0, 0) rotate(0deg);
		}
		to {
			transform: translate(-6px, 8px) rotate(6deg);
		}
	}
	.drift {
		animation: drift 9s ease-in-out infinite alternate;
	}
	.drift-slow {
		animation: drift 13s ease-in-out infinite alternate-reverse;
	}
	@media (prefers-reduced-motion: reduce) {
		.drift,
		.drift-slow {
			animation: none;
		}
	}
</style>
