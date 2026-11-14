<script lang="ts">
	import { onMount } from 'svelte';
	import BingoSquare from './BingoSquare.svelte';
	import type { SquareState } from '#lib/game/square-state.ts';

	type Square = { icon: string; label: string; state: SquareState; progress?: number };

	const start: Square[] = [
		{ icon: 'book-open', label: 'Finish a book', state: 'inProgress', progress: 0.4 },
		{ icon: 'bicycle', label: 'Bike 3×', state: 'inProgress', progress: 0.66 },
		{ icon: 'phone', label: 'Call an old friend', state: 'empty' },
		{ icon: 'cat', label: 'Litter box daily', state: 'held' },
		{ icon: 'hamburger', label: 'Eat out ≤ 10', state: 'atRisk' },
		{ icon: 'flower-lotus', label: 'Meditate 2×/week', state: 'held' },
		{ icon: 'broom', label: 'Power clean 2×/week', state: 'held' },
		{ icon: 'bed', label: 'Naps ≤ 3', state: 'lost' },
		{ icon: 'leaf', label: 'No weed', state: 'held' }
	];

	// Each step completes one square; the last one finishes the top row for a bingo.
	const steps: [index: number, state: SquareState][] = [
		[2, 'complete'],
		[1, 'complete'],
		[0, 'complete']
	];

	let squares = $state(start.map((square) => ({ ...square })));
	let animating = $state(false);

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		animating = true;
		let step = 0;
		// Plays once and stops on the bingo: auto-updating content must not run forever (WCAG 2.2.2).
		const timer = setInterval(() => {
			const [index, state] = steps[step++];
			squares[index] = { ...squares[index], state };
			if (step === steps.length) {
				clearInterval(timer);
				animating = false;
			}
		}, 1500);
		return () => clearInterval(timer);
	});
</script>

<div
	data-testid="sample-card"
	data-animating={String(animating)}
	class="grid w-full max-w-xs grid-cols-3 gap-2.5 rounded-sheet bg-surface p-3 shadow-sheet"
>
	{#each squares as square (square.label)}
		<BingoSquare {...square} />
	{/each}
</div>
