<script lang="ts">
	import { resolve } from '$app/paths';
	import Hero from '#lib/components/Hero.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/Seo.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Seo
	title="History"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<Hero title="History" summary="Your finished months and their recaps." />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 lg:max-w-5xl">
		{#if data.months.length === 0}
			<p class="rounded-row border border-dashed border-line p-5 font-bold">
				<Icon name="target" class="text-forest" />
				No finished months yet. Your first recap arrives on the 4th of next month.
			</p>
		{:else}
			<!-- Opening a recap marks it seen, so a hover must not load it. -->
			<ul
				class="flex flex-col gap-2 md:grid md:grid-cols-2 xl:grid-cols-3"
				data-sveltekit-preload-data="off"
			>
				{#each data.months as { month, name, lines, tiers } (month)}
					<li>
						<a
							href={resolve('/(app)/me/history/[month]', { month })}
							class="flex min-h-14 items-center gap-3 rounded-row bg-page p-3 font-bold tabular-nums focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
						>
							<span class="min-w-0 flex-1 break-words">
								{[name, `${lines} line${lines === 1 ? '' : 's'}`, tiers.join(', ')]
									.filter(Boolean)
									.join(' · ')}
							</span>
							{#if tiers.length > 0}
								<span aria-hidden="true" class="text-xl text-forest"><Icon name="trophy" /></span>
							{/if}
							<Icon name="caret-right" class="text-muted" />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
