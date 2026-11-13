<script lang="ts">
	import Icon from './Icon.svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		label: string;
		name: string;
		type?: 'text' | 'password' | 'number';
		value?: string | number;
		error?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		hint?: string;
		min?: number;
		max?: number;
		/** Extra classes for the input, e.g. a compact box. */
		inputClass?: string;
	};

	let {
		label,
		name,
		type = 'text',
		value = '',
		error,
		autocomplete,
		hint,
		min,
		max,
		inputClass
	}: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;
	const describedBy = $derived(
		[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="font-extrabold">{label}</label>
	{#if hint}
		<p id={hintId} class="text-sm text-muted">{hint}</p>
	{/if}
	<input
		{id}
		{name}
		{type}
		{value}
		{autocomplete}
		{min}
		{max}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={[
			'w-full rounded-[14px] border bg-surface px-4 py-2.5 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest',
			error ? 'border-terracotta' : 'border-line',
			inputClass
		]}
	/>
	{#if error}
		<p id={errorId} class="text-sm font-bold text-ink">
			<Icon name="warning" />
			{error}
		</p>
	{/if}
</div>
