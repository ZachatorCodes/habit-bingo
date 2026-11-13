<script lang="ts">
	import { resolve } from '$app/paths';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<Seo
	title="Delete {data.habit.name}"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<Hero title="Delete {data.habit.name}?" />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
		<div class="text-4xl text-forest"><Icon name={data.habit.icon} /></div>
		<p class="text-muted">Your cards keep their copy of it. This can't be undone.</p>
		{#if form?.message}
			<p role="alert" class="rounded-row bg-risk-tile px-4 py-3 font-bold">
				<Icon name="warning" />
				{form.message}
			</p>
		{/if}
		<form method="POST" class="flex flex-wrap items-center gap-3">
			<button
				type="submit"
				class="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-terracotta bg-surface px-5 font-extrabold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>Delete forever</button
			>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() can't carry the ?archived=1 query -->
			<a
				href={`${resolve('/(app)/me/habits')}?archived=1`}
				class="inline-flex min-h-11 items-center rounded-full px-4 font-extrabold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>Cancel</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</form>
	</div>
</section>
