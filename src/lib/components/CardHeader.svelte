<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CARD_SIZES, type CardSize } from '#lib/game/card-layout.ts';
	import { nextTier, squaresToLine, type CardScore, type Tier } from '#lib/game/score.ts';
	import type { SquareState } from '#lib/game/square-state.ts';
	import type { Rewards } from '#lib/game/types.ts';
	import Hero from './Hero.svelte';
	import Icon from './Icon.svelte';

	type Props = {
		monthName: string;
		daysLeft: number;
		score: CardScore;
		size: CardSize;
		rewards: Rewards;
		/** Every square's state in board order, for the line status. */
		states: SquareState[];
		/** Whether each square counts now, in board order. */
		counting: boolean[];
		/** The board and anything that belongs on the sheet above the reward rows. */
		children?: Snippet;
	};

	let { monthName, daysLeft, score, size, rewards, states, counting, children }: Props = $props();

	const tiers = $derived<{ tier: Tier; label: string; reward: string }[]>([
		{ tier: 'bingo', label: 'Bingo', reward: rewards.bingo },
		{
			tier: 'sixtyPercent',
			label: `${CARD_SIZES[size].sixtyThreshold} squares`,
			reward: rewards.sixty
		},
		{ tier: 'blackout', label: 'Blackout', reward: rewards.blackout }
	]);
	// On track: counts now, or a protected / at-risk habit that counts at month end if kept up.
	const onTrack = $derived(
		states.map((state, i) => counting[i] || state === 'held' || state === 'atRisk')
	);
	const toLine = $derived(squaresToLine(size, states, onTrack));
	const lineText = $derived(
		squaresToLine(size, states, counting) === 0
			? 'Bingo!'
			: toLine === null
				? 'No lines left this month'
				: toLine === 0
					? 'On track for a bingo'
					: `${toLine} ${toLine === 1 ? 'square' : 'squares'} from a line`
	);
	const next = $derived(nextTier(score.tiers));
	const nextReward = $derived(
		next === 'bingo' ? rewards.bingo : next === 'sixtyPercent' ? rewards.sixty : rewards.blackout
	);
</script>

<Hero title="{monthName} card" summary="{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left" />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div
		class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,640px)_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-8"
	>
		<div class="flex items-end justify-end gap-4 lg:col-start-2 lg:row-start-1">
			<div class="text-right text-[13px] font-semibold">
				<p>{lineText}</p>
				{#if next}<p class="text-muted">Next reward: {nextReward}</p>{/if}
			</div>
		</div>

		<div class="flex flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
			{@render children?.()}
		</div>

		<div class="flex flex-col lg:col-start-2 lg:row-start-2">
			<p class="mb-1 text-xs font-extrabold tracking-[0.02em]">{score.percent}% complete</p>
			<ul aria-label="Rewards" class="flex flex-col divide-y divide-line">
				{#each tiers as { tier, label, reward } (tier)}
					<li class="flex items-baseline justify-between gap-3 py-2 text-sm">
						<span class="font-bold">{label}</span>
						<span class="text-muted">{reward}</span>
						{#if score.tiers.includes(tier)}
							<span class="inline-flex items-center gap-1 font-extrabold text-forest"
								><Icon name="check-circle" /> Reached</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</div>
</section>
