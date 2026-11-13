<script lang="ts">
	import type { Habit } from '#lib/game/types.ts';
	import TextField from './TextField.svelte';

	type Row = {
		habit: Pick<Habit, 'id' | 'icon' | 'name' | 'direction' | 'period' | 'countMode' | 'target'>;
		/** The target for a card started on `startDate`. */
		prorated: number;
		/** What the field shows: the current target, or what the person typed. */
		value: number | string;
		range: { min: number; max: number };
	};
	type Props = {
		rows: Row[];
		/** Null for next month's card, which starts on the 1st with nothing shortened. */
		daysLeft: number | null;
		monthName: string;
		/** The card's first day (YYYY-MM-DD), named in the explanation of daily habits. */
		startDate: string;
		/** Error messages by field name, `target:{habitId}`. */
		errors: Record<string, string>;
	};
	let { rows, daysLeft, monthName, startDate, errors }: Props = $props();

	const startLabel = $derived(`${monthName} ${Number(startDate.slice(8, 10))}`);

	function explain(row: Row): string | undefined {
		const { habit, prorated } = row;
		if (habit.period === 'month') {
			return prorated === habit.target ? undefined : `Prorated from ${habit.target}`;
		}
		if (habit.period === 'day') return `Every day from ${startLabel}`;
		return `${prorated} a week (short weeks scale down)`;
	}
</script>

<div class="flex flex-col gap-4">
	{#if daysLeft === null}
		<h2 class="text-2xl font-extrabold">Targets for {monthName}</h2>
		<p class="text-muted">Change any of them to what feels right.</p>
	{:else}
		<h2 class="text-2xl font-extrabold">
			{daysLeft}
			{daysLeft === 1 ? 'day' : 'days'} left in {monthName}
		</h2>
		<p class="text-muted">
			Targets are shortened for the days left. Change any of them to what feels right.
		</p>
	{/if}
	{#each rows as row (row.habit.id)}
		<TextField
			label={row.habit.name}
			name="target:{row.habit.id}"
			type="number"
			value={row.value}
			min={row.range.min}
			max={row.range.max}
			hint={explain(row)}
			error={errors[`target:${row.habit.id}`]}
		/>
	{/each}
</div>
