<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Step } from '#lib/game/card-draft.ts';

	type Props = {
		steps: Step[];
		current: Step;
		completed: Step[];
		/** Building next month's card: step links keep `?for=next`. */
		forNext?: boolean;
	};
	let { steps, current, completed, forNext = false }: Props = $props();

	const LABELS: Record<Step, string> = {
		size: 'Size',
		habits: 'Habits',
		targets: 'Targets',
		rewards: 'Rewards',
		board: 'Board'
	};
	const position = $derived(steps.indexOf(current) + 1);
</script>

<!-- A slim bar on the hero: one segment per step, names below. -->
<ol aria-label="Card builder steps" class="mt-4 grid grid-cols-5 gap-1.5 text-[12px] font-semibold">
	{#each steps as step (step)}
		{@const done = completed.includes(step) && step !== current}
		<li aria-current={step === current ? 'step' : undefined} class="relative flex flex-col gap-1.5">
			<span
				aria-hidden="true"
				class={[
					'h-1.5 rounded-full',
					step === current || done ? 'bg-surface' : 'bg-leaf-2',
					step === current && 'ring-2 ring-surface/40'
				]}
			></span>
			{#if done}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() can't carry the ?for=next query -->
				<a
					href={resolve('/(app)/card/build/[step]', { step }) + (forNext ? '?for=next' : '')}
					class="truncate underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-surface"
					>{LABELS[step]}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<span class={['truncate', step === current ? 'font-extrabold' : 'opacity-80']}
					>{LABELS[step]}</span
				>
			{/if}
			{#if step === current}
				<span class="sr-only">Step {position} of {steps.length}</span>
			{/if}
		</li>
	{/each}
</ol>
