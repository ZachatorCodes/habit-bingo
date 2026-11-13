<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * A destructive form post. With JavaScript it confirms in a dialog first; without it the button
	 * posts the form directly.
	 */
	type Props = {
		action: string;
		label: string;
		ariaLabel?: string;
		title: string;
		text: string;
		confirm: string;
		/** Extra hidden form fields. */
		fields?: Record<string, string>;
	};
	let { action, label, ariaLabel, title, text, confirm, fields = {} }: Props = $props();

	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	let dialog = $state<HTMLDialogElement>();
	const dialogTitle = $props.id();
	const buttonClass =
		'min-h-11 rounded-full border border-line bg-surface px-3 py-1.5 font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';
</script>

{#snippet hidden()}
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
{/snippet}

{#if hydrated}
	<button
		type="button"
		aria-label={ariaLabel}
		onclick={() => dialog?.showModal()}
		class={buttonClass}>{label}</button
	>
	<dialog
		bind:this={dialog}
		aria-labelledby={dialogTitle}
		class="m-auto max-w-sm rounded-[24px] bg-surface p-5 text-ink shadow-sheet backdrop:bg-ink/40"
	>
		<h2 id={dialogTitle} class="text-xl font-bold break-words">{title}</h2>
		<p class="mt-2 text-muted">{text}</p>
		<form method="POST" {action} class="mt-5 flex flex-wrap justify-end gap-3">
			{@render hidden()}
			<button
				type="button"
				onclick={() => dialog?.close()}
				class="min-h-11 rounded-xl px-3 py-1.5 font-bold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>Cancel</button
			>
			<button
				type="submit"
				class="min-h-11 rounded-full border border-terracotta bg-risk-tile px-4 py-1.5 font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>{confirm}</button
			>
		</form>
	</dialog>
{:else}
	<form method="POST" {action}>
		{@render hidden()}
		<button type="submit" aria-label={ariaLabel} class={buttonClass}>{label}</button>
	</form>
{/if}
