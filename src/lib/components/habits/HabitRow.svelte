<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import { describeRule } from '#lib/game/habit-rules.ts';
	import type { Habit } from '#lib/game/types.ts';

	type Props = {
		habit: Habit;
		archived?: boolean;
		/**
		 * The page's own query (e.g. "&category=fitness"), appended to form actions: an action URL
		 * like "?/archive" replaces the query, so without it the page would lose its view after posting.
		 */
		keep?: string;
	};
	let { habit, archived = false, keep = '' }: Props = $props();

	const action = $derived(archived ? 'restore' : 'archive');
	const actionLabel = $derived(archived ? 'Restore' : 'Archive');

	// Deleting confirms in a dialog once JavaScript runs; before that (or without it) the Delete
	// link opens a confirmation page instead.
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	let dialog = $state<HTMLDialogElement>();
	const iconButton =
		'inline-flex size-11 items-center justify-center rounded-full text-xl text-muted hover:bg-page focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';
	const dialogTitle = $props.id();
	const deleteHref = $derived(resolve('/(app)/me/habits/[id]/delete', { id: habit.id }));
</script>

<li class="flex items-center gap-2 rounded-row border border-line bg-surface p-2 pl-3">
	<ProgressRing icon={habit.icon} variant="open" size="sm" />
	<div class="min-w-0 flex-1 px-1">
		<p class="flex items-center gap-1.5 font-bold">
			<span class="min-w-0 break-words">{habit.name}</span>
			{#if habit.isPrivate}
				<Icon name="lock" class="shrink-0 text-muted" /><span class="sr-only">Private</span>
			{/if}
		</p>
		<p class="text-sm text-muted">{describeRule(habit)}</p>
	</div>
	{#if !archived}
		<a
			href={resolve('/(app)/me/habits/[id]', { id: habit.id })}
			aria-label={`Edit ${habit.name}`}
			class={iconButton}><Icon name="pencil-simple" /></a
		>
	{/if}
	<form method="POST" action={`?/${action}${keep}`} use:enhance>
		<input type="hidden" name="id" value={habit.id} />
		<button type="submit" aria-label={`${actionLabel} ${habit.name}`} class={iconButton}
			><Icon name={archived ? 'arrow-counter-clockwise' : 'archive'} /></button
		>
	</form>
	{#if archived}
		{#if hydrated}
			<button
				type="button"
				aria-label={`Delete ${habit.name}`}
				onclick={() => dialog?.showModal()}
				class={iconButton}><Icon name="trash" /></button
			>
			<dialog
				bind:this={dialog}
				aria-labelledby={dialogTitle}
				class="m-auto max-w-sm rounded-[24px] bg-surface p-5 text-ink shadow-sheet backdrop:bg-ink/40"
			>
				<h2 id={dialogTitle} class="text-xl font-extrabold">Delete {habit.name} forever?</h2>
				<p class="mt-2 text-muted">Your cards keep their copy of it. This can't be undone.</p>
				<form method="POST" action={deleteHref} class="mt-5 flex flex-wrap justify-end gap-3">
					<button
						type="button"
						onclick={() => dialog?.close()}
						class="min-h-11 rounded-full px-4 font-bold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
						>Cancel</button
					>
					<button
						type="submit"
						class="min-h-11 rounded-full border-2 border-terracotta bg-surface px-5 font-extrabold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
						>Delete forever</button
					>
				</form>
			</dialog>
		{:else}
			<a href={deleteHref} aria-label={`Delete ${habit.name}`} class={iconButton}
				><Icon name="trash" /></a
			>
		{/if}
	{/if}
</li>
