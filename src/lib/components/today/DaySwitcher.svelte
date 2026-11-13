<script lang="ts">
	import { resolve } from '$app/paths';
	import { addDays, weekday } from '#lib/game/calendar.ts';

	type Props = {
		/** The days that can be logged, newest first (today and up to 3 before). */
		days: string[];
		selected: string;
		today: string;
	};

	let { days, selected, today }: Props = $props();

	const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const label = (day: string) =>
		day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : WEEKDAYS[weekday(day)];
	const linkClass = (day: string) => [
		'inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink',
		day === selected ? 'border-forest bg-forest text-white' : 'border-line bg-surface text-ink'
	];
</script>

{#if days.length > 1}
	<nav aria-label="Day" class="flex flex-wrap gap-2">
		{#each days as day (day)}
			{#if day === today}
				<a
					href={resolve('/(app)/today')}
					aria-current={day === selected ? 'date' : undefined}
					class={linkClass(day)}>{label(day)}</a
				>
			{:else}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() can't carry the ?day= query -->
				<a
					href={`${resolve('/(app)/today')}?day=${day}`}
					aria-current={day === selected ? 'date' : undefined}
					class={linkClass(day)}>{label(day)}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{/each}
	</nav>
{/if}
