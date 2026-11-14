<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import SampleCard from '#lib/components/card/SampleCard.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';

	const steps = [
		{
			icon: 'target',
			title: 'Build your card',
			text: 'Pick habits for a 3×3 or 5×5 card and set your own rewards.'
		},
		{
			icon: 'alarm',
			title: 'Check in daily',
			text: 'Earn squares, protect your streaks, and watch the board fill up.'
		},
		{
			icon: 'trophy',
			title: 'Win with friends',
			text: 'Hit bingo, unlock rewards, and climb your group leaderboard.'
		}
	];
</script>

<Seo
	title="Turn your habits into bingo"
	description="Build a monthly bingo card of your habits, check them off every day, and race your friends to a blackout."
	path="/"
/>

<!-- Band and content share one grid so the card sheet can overlap the band's bottom edge on phones. -->
<div class="grid grid-cols-1 md:grid-cols-2 md:items-center">
	<div
		aria-hidden="true"
		data-testid="landing-band"
		class="relative col-span-full row-span-2 row-start-1 mb-8 self-stretch overflow-hidden bg-forest md:mb-0"
	>
		<svg viewBox="0 0 80 80" class="drift absolute -top-4 -right-3 size-28 text-leaf md:size-40">
			<path d="M10 70C10 30 40 8 72 8c0 36-20 62-62 62Z" fill="currentColor" />
		</svg>
		<svg
			viewBox="0 0 80 80"
			class="drift-slow absolute right-16 -bottom-6 size-20 text-leaf-2 md:size-28"
		>
			<path d="M70 70C70 36 46 14 14 14c0 34 18 56 56 56Z" fill="currentColor" />
		</svg>
	</div>
	<div
		class="relative col-start-1 row-start-1 px-4 pt-[calc(3rem+var(--safe-top))] pb-14 text-center text-surface md:col-start-1 md:pt-[calc(5rem+var(--safe-top))] md:pb-20 md:pl-[max(1rem,calc(100%-31rem))] md:text-left"
	>
		<h1 class="text-4xl leading-tight font-extrabold md:text-5xl">
			Turn your habits into a game of bingo.
		</h1>
		<p class="mt-4 text-lg text-surface">
			Build a monthly card, check off habits, and race your friends to a blackout.
		</p>
		<div class="mt-8 flex flex-col items-center gap-3 md:items-start">
			<!-- The default ink focus ring is too faint on forest. -->
			<Button href={resolve('/signin')} variant="secondary" class="focus-visible:outline-surface!"
				>Sign in</Button
			>
			<p class="text-surface">Invite-only beta.</p>
		</div>
	</div>
	<div
		class="relative col-start-1 row-start-2 -mt-8 flex justify-center px-4 md:col-start-2 md:row-start-1 md:mt-0 md:pr-[max(1rem,calc(100%-31rem))]"
	>
		<SampleCard />
	</div>
</div>

<section class="mx-auto mt-16 grid max-w-5xl gap-4 px-4 sm:grid-cols-3">
	{#each steps as step (step.title)}
		<div class="rounded-tile bg-surface p-5 shadow-sheet">
			<ProgressRing icon={step.icon} variant="earned" size="md" />
			<h2 class="mt-3 text-lg font-extrabold">{step.title}</h2>
			<p class="mt-1 text-muted">{step.text}</p>
		</div>
	{/each}
</section>

<style>
	@keyframes drift {
		from {
			transform: translate(0, 0) rotate(0deg);
		}
		to {
			transform: translate(-6px, 8px) rotate(6deg);
		}
	}
	.drift {
		animation: drift 9s ease-in-out infinite alternate;
	}
	.drift-slow {
		animation: drift 13s ease-in-out infinite alternate-reverse;
	}
	@media (prefers-reduced-motion: reduce) {
		.drift,
		.drift-slow {
			animation: none;
		}
	}
</style>
