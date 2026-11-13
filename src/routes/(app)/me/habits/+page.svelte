<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import CategoryFilter from '#lib/components/habits/CategoryFilter.svelte';
	import HabitRow from '#lib/components/habits/HabitRow.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import StarterHabits from '#lib/components/builder/StarterHabits.svelte';
	import { CATEGORIES } from '#lib/game/categories.ts';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const groups = $derived(
		CATEGORIES.map((category) => ({
			category,
			habits: data.habits.filter((habit) => habit.category === category.id)
		})).filter((group) => group.habits.length > 0)
	);
	const selectedLabel = $derived(CATEGORIES.find((c) => c.id === data.category)?.label);
	/** This view's query, carried through form actions so posting keeps the same view. */
	const keep = $derived(
		[
			data.category ? `category=${data.category}` : '',
			data.archived ? 'archived=1' : '',
			data.welcome ? 'welcome=1' : ''
		]
			.filter(Boolean)
			.map((part) => `&${part}`)
			.join('')
	);
	const toggleQuery = $derived(
		data.archived
			? data.category
				? `?category=${data.category}`
				: ''
			: data.category
				? `?category=${data.category}&archived=1`
				: '?archived=1'
	);
</script>

<Seo
	title="Habit library"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<Hero
	title="Habit library"
	summary={data.archived
		? 'Archived habits. Restore one to use it again.'
		: 'Everything you can put on a card.'}
/>

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5 lg:max-w-5xl">
		{#if data.created}
			<Notice tone="success">Habit added.</Notice>
		{:else if data.saved}
			<Notice tone="success">Habit saved.</Notice>
		{:else if data.deleted}
			<Notice tone="success">Habit deleted.</Notice>
		{/if}
		{#if form && 'message' in form && form.message}
			<Notice tone="error">{form.message}</Notice>
		{/if}

		{#if data.welcome}
			<div class="rounded-row bg-page p-4">
				<p class="text-lg font-extrabold">Welcome! Start your habit library.</p>
				<p class="text-muted">Add a few habits now; you'll pick from them when you build a card.</p>
			</div>
		{/if}

		<div class="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_1fr] lg:items-start lg:gap-6">
			{#if data.activeCount > 0 || data.archived}
				<CategoryFilter selected={data.category} counts={data.counts} archived={data.archived} />
			{/if}

			<div class="flex flex-col gap-5 lg:col-start-2">
				{#if groups.length === 0}
					<div
						class="flex flex-col items-start gap-3 rounded-row border border-dashed border-line p-5"
					>
						{#if selectedLabel}
							<p class="font-bold">No habits in {selectedLabel} yet.</p>
						{:else if data.archived}
							<p class="font-bold">Nothing archived.</p>
						{:else}
							<p class="font-bold">No habits yet.</p>
						{/if}
						{#if !data.archived}
							<Button href="/me/habits/new" variant="secondary">New habit</Button>
						{/if}
					</div>
				{:else}
					{#each groups as group (group.category.id)}
						<section aria-labelledby={`cat-${group.category.id}`} class="flex flex-col gap-2">
							<h2
								id={`cat-${group.category.id}`}
								class="flex items-center gap-2 text-lg font-extrabold"
							>
								<Icon name={group.category.icon} class="text-forest" />
								{group.category.label}
							</h2>
							<ul class="flex flex-col gap-2">
								{#each group.habits as habit (habit.id)}
									<HabitRow {habit} archived={data.archived} {keep} />
								{/each}
							</ul>
						</section>
					{/each}
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-3">
			{#if groups.length > 0 || data.archived}
				<Button href="/me/habits/new">New habit</Button>
			{/if}
			<!-- A resolve()d path plus a query string, which the lint rule cannot follow. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={resolve('/(app)/me/habits') + toggleQuery}
				class="inline-flex min-h-11 items-center text-sm font-bold text-muted underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest"
				>{data.archived ? 'Show active habits' : `Show archived (${data.archivedCount})`}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>

		{#if data.welcome}
			<a
				href={resolve('/(app)/card/build')}
				class="inline-flex min-h-11 items-center font-bold text-forest underline underline-offset-4"
				>Build your first card <span aria-hidden="true">→</span></a
			>
		{/if}
	</div>
</section>

{#if !data.archived && (data.welcome || data.activeCount < 8)}
	<StarterHabits addedIds={data.addedIds} {keep} />
{/if}
