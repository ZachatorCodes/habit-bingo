<script lang="ts">
	import { untrack } from 'svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import type { SquareState } from '#lib/game/square-state.ts';

	type Props = {
		icon: string;
		label: string;
		state: SquareState;
		/** 0..1, shown for inProgress squares. */
		progress?: number;
		/** Show the name under the icon (default). Today's rows show it beside the square instead. */
		showLabel?: boolean;
		/** A 5×5 card on a phone: smaller icon, name in small text on up to 2 lines. */
		compact?: boolean;
		/** Bigger ring and Free label (Today's wide board); `compact` wins. */
		large?: boolean;
	};

	let {
		icon,
		label,
		state: sq,
		progress = 0,
		showLabel = true,
		compact = false,
		large = false
	}: Props = $props();
	const ring = $derived(compact ? 'sm' : large ? 'lg' : 'md');

	const percent = $derived(Math.round(Math.min(Math.max(progress, 0), 1) * 100));

	const stateText = $derived(
		{
			empty: 'not started',
			inProgress: `in progress, ${percent}%`,
			complete: 'complete',
			held: 'protected',
			atRisk: 'at risk',
			lost: 'lost',
			free: 'free',
			buildNext: "build next month's card"
		}[sq]
	);

	// Tile tint and ring per state; ring shape (solid/dashed/muted) keeps states off colour alone.
	const looks: Record<
		'empty' | 'inProgress' | 'complete' | 'held' | 'atRisk' | 'lost',
		{ tile: string; ring: 'open' | 'progress' | 'earned' | 'protected' | 'risk' | 'lost' }
	> = {
		empty: { tile: 'bg-page', ring: 'open' },
		inProgress: { tile: 'bg-page', ring: 'progress' },
		complete: { tile: 'bg-earned-tile', ring: 'earned' },
		held: { tile: 'bg-protected-tile', ring: 'protected' },
		atRisk: { tile: 'bg-risk-tile', ring: 'risk' },
		lost: { tile: 'bg-page', ring: 'lost' }
	};

	// Soft pop when a square becomes complete, not on first render.
	let popped = $state(false);
	let previous = untrack(() => sq);
	$effect(() => {
		if (sq === 'complete' && previous !== 'complete') popped = true;
		previous = sq;
	});
</script>

<div
	role="img"
	aria-label={sq === 'free' ? label : `${label}: ${stateText}`}
	data-state={sq}
	onanimationend={() => (popped = false)}
	class={[
		'relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-square p-1 text-center font-bold',
		sq === 'free' ? 'bg-forest text-white' : 'text-ink',
		sq === 'buildNext' && 'border-2 border-dashed border-forest bg-surface',
		sq !== 'free' && sq !== 'buildNext' && looks[sq].tile,
		popped && 'pop'
	]}
>
	{#if sq === 'free'}
		<span aria-hidden="true" class={[large && !compact ? 'text-lg' : 'text-sm', 'font-extrabold']}
			>Free</span
		>
	{:else}
		{#if sq === 'buildNext'}
			<ProgressRing icon="rocket" variant="open" size={ring} />
		{:else}
			<ProgressRing {icon} variant={looks[sq].ring} {percent} size={ring} />
		{/if}
		{#if showLabel}
			<span
				data-label
				aria-hidden="true"
				class={[
					'line-clamp-2 w-full font-extrabold',
					compact ? 'text-xs leading-[1.1] wrap-anywhere' : 'text-xs leading-tight break-words',
					sq === 'lost' && 'line-through'
				]}>{sq === 'buildNext' ? 'Next month' : label}</span
			>
		{/if}
	{/if}
</div>
