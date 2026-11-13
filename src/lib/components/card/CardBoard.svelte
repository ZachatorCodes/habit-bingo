<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CardSize } from '#lib/game/card-layout.ts';
	import type { SquareState } from '#lib/game/square-state.ts';
	import BingoSquare from './BingoSquare.svelte';

	type Props = {
		size: CardSize;
		squares: {
			/** A habit square's id: it links to its habit sheet. */
			id?: string;
			icon: string;
			name: string;
			state: SquareState;
			/** 0–1, shown on earn squares in progress. */
			progress?: number;
			/** The center square, which leads to next month's card (spec §3.5). */
			link?: boolean;
		}[];
		/** Opens a habit sheet over the card instead of following its link (shallow routing). */
		onopen?: (event: MouseEvent, href: string) => void;
		/** Lines just completed: their squares ripple gold in sequence (spec §4.7). */
		highlight?: number[][];
		/** Bigger icons and Free label (Today's wide board panel). */
		large?: boolean;
	};

	let { size, squares, onopen, highlight = [], large = false }: Props = $props();

	// Each square's ripple delay: its place along the first completed line it's on.
	const delays = $derived.by(() => {
		const delay: Record<number, number> = {};
		for (const line of highlight) {
			line.forEach((index, step) => {
				delay[index] ??= step * 80;
			});
		}
		return delay;
	});

	const linkClass =
		'block rounded-square focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';
</script>

<!-- Every square shows its name; 5×5 squares are compact on phones (smaller icons and text). -->
<div class="grid gap-1.5 sm:gap-2" style:grid-template-columns="repeat({size}, minmax(0, 1fr))">
	{#each squares as square, index (index)}
		<div
			class={[index in delays && 'ripple']}
			style:animation-delay={index in delays ? `${delays[index]}ms` : undefined}
		>
			{#if square.link}
				<a href={resolve('/(app)/card/next')} class={linkClass}>
					<BingoSquare
						icon={square.icon}
						label={square.name}
						state={square.state}
						progress={square.progress}
						compact={size === 5}
						{large}
					/>
				</a>
			{:else if square.id}
				{@const href = resolve('/(app)/card/squares/[id]', { id: square.id })}
				<a {href} onclick={(event) => onopen?.(event, href)} class={linkClass}>
					<BingoSquare
						icon={square.icon}
						label={square.name}
						state={square.state}
						progress={square.progress}
						compact={size === 5}
						{large}
					/>
				</a>
			{:else}
				<BingoSquare
					icon={square.icon}
					label={square.name}
					state={square.state}
					progress={square.progress}
					compact={size === 5}
					{large}
				/>
			{/if}
		</div>
	{/each}
</div>
