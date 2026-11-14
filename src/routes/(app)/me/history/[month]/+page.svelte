<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import CardBoard from '#lib/components/card/CardBoard.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const sheet = 'relative rounded-[24px] bg-surface shadow-sheet';
	const inner = 'mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5';
	const heading = 'text-xs font-extrabold tracking-wide text-muted uppercase';
	const row = 'flex min-h-14 items-center gap-3 rounded-row bg-page p-3';
</script>

<Seo
	title="{data.monthName} recap"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<Hero
	title={`${data.monthName} recap`}
	summary={`${plural(data.result.lines, 'line')} · ${data.result.squaresCounting} of ${data.squares} squares counting`}
/>

<div class="lg:mx-auto lg:-mt-[18px] lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-4">
	<section class="{sheet} -mt-[18px] lg:mt-0">
		<div class={inner}>
			<a
				href={resolve('/(app)/me/history')}
				class="inline-flex min-h-11 items-center gap-1 font-bold text-forest underline-offset-4 hover:underline"
				><Icon name="arrow-left" /> History</a
			>
			<CardBoard size={data.size} squares={data.board} />
		</div>
	</section>

	<div class="contents lg:flex lg:flex-col lg:gap-4">
		{#if data.rewards.length > 0}
			<section aria-labelledby="rewards" class="{sheet} mt-4 lg:mt-0">
				<div class={inner}>
					<h2 id="rewards" class={heading}>Rewards earned</h2>
					<ul class="flex flex-col gap-2">
						{#each data.rewards as { label, reward } (label)}
							<li class={row}>
								<span
									aria-hidden="true"
									class="grid size-10 shrink-0 place-items-center rounded-full bg-earned-tile text-2xl text-forest"
									><Icon name="trophy" /></span
								>
								<span class="min-w-0 flex-1 break-words"
									><span class="font-extrabold">{label}:</span> {reward}</span
								>
							</li>
						{/each}
					</ul>
				</div>
			</section>
		{/if}

		{#if data.highlight}
			<section aria-labelledby="highlight" class="{sheet} mt-4 lg:mt-0">
				<div class={inner}>
					<h2 id="highlight" class={heading}>Most logged</h2>
					<p class={row}>
						<ProgressRing icon={data.highlight.icon} variant="earned" />
						<span class="min-w-0 flex-1 break-words"
							><span class="font-extrabold">{data.highlight.name}:</span>
							{plural(data.highlight.total, 'check-in')}</span
						>
					</p>
				</div>
			</section>
		{/if}

		<section aria-labelledby="categories" class="{sheet} mt-4 lg:mt-0">
			<div class={inner}>
				<h2 id="categories" class={heading}>By category</h2>
				<ul class="flex flex-col gap-2">
					{#each data.categories as category (category.id)}
						<li class="{row} tabular-nums">
							<span aria-hidden="true" class="text-2xl text-forest"
								><Icon name={category.icon} /></span
							>
							<span class="min-w-0 flex-1 font-bold">{category.label}</span>
							<span>{category.counting} of {category.total}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	</div>
</div>

{#if data.buildCard}
	<div class="mx-auto mt-4 max-w-2xl px-4 pb-4">
		<Button href={resolve('/(app)/card/build')} class="w-full"
			>Build {data.buildMonthName}'s card</Button
		>
	</div>
{/if}
