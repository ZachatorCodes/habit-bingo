<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * A value to hand on, such as a link. Without JavaScript it is read-only, selectable text; with a
	 * clipboard available a copy button appears and confirms the copy.
	 */
	type Props = { label: string; value: string; copyLabel: string };
	let { label, value, copyLabel }: Props = $props();

	const id = $props.id();
	let canCopy = $state(false);
	let message = $state('');

	onMount(() => {
		canCopy = Boolean(navigator.clipboard?.writeText);
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			message = 'Copied.';
		} catch {
			message = "Couldn't copy. Select the link and copy it yourself.";
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="font-extrabold">{label}</label>
	<div class="flex flex-wrap gap-2">
		<input
			{id}
			{value}
			readonly
			onfocus={(event) => event.currentTarget.select()}
			class="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 font-mono text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
		/>
		{#if canCopy}
			<button
				type="button"
				aria-label={copyLabel}
				onclick={copy}
				class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-forest bg-forest px-4 py-2.5 font-extrabold text-white transition-transform focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.97]"
				><Icon name="notebook" /> Copy</button
			>
		{/if}
	</div>
	<p role="status" class="text-sm font-bold text-ink empty:hidden">
		{#if message}<span aria-hidden="true"
				>{#if message === 'Copied.'}✓{:else}<Icon name="warning" />{/if}</span
			>
			{message}{/if}
	</p>
</div>
