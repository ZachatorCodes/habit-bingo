<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { CATEGORIES } from '#lib/game/categories.ts';
	import { describeRule } from '#lib/game/habit-rules.ts';
	import type { Habit } from '#lib/game/types.ts';

	type Props = { habits: Habit[]; selected: string[]; need: number; errorId?: string };
	let { habits, selected = $bindable(), need, errorId }: Props = $props();

	const groups = $derived(
		CATEGORIES.map((category) => ({
			category,
			habits: habits.filter((habit) => habit.category === category.id)
		})).filter((group) => group.habits.length > 0)
	);
</script>

<div class="flex flex-col gap-5" role="group" aria-label="Your habits" aria-describedby={errorId}>
	<p aria-live="polite" class="font-extrabold">{selected.length} of {need} picked</p>
	{#each groups as group (group.category.id)}
		<fieldset class="flex flex-col gap-2">
			<legend class="mb-1.5 flex items-center gap-2 text-lg font-extrabold">
				<Icon name={group.category.icon} />
				{group.category.label}
			</legend>
			{#each group.habits as habit (habit.id)}
				<label
					class="group flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface p-3 has-[:checked]:border-forest has-[:checked]:bg-earned-tile has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest"
				>
					<input
						type="checkbox"
						name="habitIds"
						value={habit.id}
						bind:group={selected}
						class="sr-only"
					/>
					<ProgressRing icon={habit.icon} variant="open" size="sm" />
					<span class="min-w-0 flex-1">
						<span class="block font-extrabold wrap-anywhere">{habit.name}</span>
						<span class="block text-sm text-muted">{describeRule(habit)}</span>
					</span>
					<Check
						weight="bold"
						size={20}
						aria-hidden="true"
						class="hidden shrink-0 text-forest group-has-[:checked]:block"
					/>
				</label>
			{/each}
		</fieldset>
	{/each}
</div>
