<script lang="ts">
	import { addDays, monthName, weekday } from '#lib/game/calendar.ts';
	import { monthGrid } from '#lib/game/month-grid.ts';

	type Props = {
		month: string;
		weekStartsOn: 'monday' | 'sunday';
		today: string;
		selected: string;
		days: Record<string, { count: number; loggable: boolean }>;
		direction: 'atLeast' | 'atMost';
		/** When set, cells are links (the no-JavaScript path); otherwise buttons calling `onselect`. */
		href?: (date: string) => string;
		onselect?: (date: string) => void;
	};

	let { month, weekStartsOn, today, selected, days, direction, href, onselect }: Props = $props();

	const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const grid = $derived(monthGrid(month, weekStartsOn));
	const heads = $derived(
		grid[0].map((_, i) => WEEKDAYS[(i + (weekStartsOn === 'monday' ? 1 : 0)) % 7])
	);
	let root: HTMLElement;

	const info = (date: string) => days[date] ?? { count: 0, loggable: false };
	const label = (date: string) => {
		const { count, loggable } = info(date);
		const status = !loggable ? "can't log" : count ? `${count} logged` : 'not logged';
		return `${WEEKDAYS[weekday(date)]} ${monthName(month)} ${Number(date.slice(8))}, ${status}`;
	};
	const cellClass = (date: string) => {
		const { count, loggable } = info(date);
		return [
			'relative flex min-h-11 w-full min-w-11 flex-col items-center justify-center rounded-xl text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink',
			date === selected
				? 'bg-forest text-white'
				: loggable
					? 'text-ink'
					: 'text-muted disabled:opacity-60',
			date === today && 'ring-2 ring-forest ring-inset',
			count > 0 && 'logged'
		];
	};

	function onkeydown(event: KeyboardEvent, date: string) {
		const week = grid.find((row) => row.includes(date))!.filter((d) => d !== null);
		const target = {
			ArrowLeft: addDays(date, -1),
			ArrowRight: addDays(date, 1),
			ArrowUp: addDays(date, -7),
			ArrowDown: addDays(date, 7),
			Home: week[0],
			End: week[week.length - 1]
		}[event.key];
		const el = target && root.querySelector<HTMLElement>(`[data-date="${target}"]`);
		if (!el) return;
		event.preventDefault();
		el.focus();
	}
</script>

<div bind:this={root} role="grid" aria-label={`${monthName(month)} ${month.slice(0, 4)}`}>
	<div role="row" class="grid grid-cols-7 gap-1 pb-1">
		{#each heads as head (head)}
			<div role="columnheader" aria-label={head} class="text-center text-xs font-bold text-muted">
				{head.slice(0, 3)}
			</div>
		{/each}
	</div>
	{#each grid as week (week[0] ?? week[6])}
		<div role="row" class="grid grid-cols-7 gap-1 pb-1">
			{#each week as date, i (date ?? `blank-${i}`)}
				<div role="gridcell">
					{#if date}
						{@const { count, loggable } = info(date)}
						{@const slip = direction === 'atMost' && count > 0}
						{#if href && loggable}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- the caller resolves the path -->
							<a
								href={href(date)}
								data-date={date}
								data-slip={slip ? '' : undefined}
								aria-label={label(date)}
								aria-current={date === selected ? 'date' : undefined}
								onkeydown={(e) => onkeydown(e, date)}
								class={cellClass(date)}
							>
								{@render face(date, count, slip)}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{:else}
							<button
								type="button"
								data-date={date}
								data-slip={slip ? '' : undefined}
								aria-label={label(date)}
								aria-current={date === selected ? 'date' : undefined}
								disabled={!loggable}
								onclick={() => onselect?.(date)}
								onkeydown={(e) => onkeydown(e, date)}
								class={cellClass(date)}
							>
								{@render face(date, count, slip)}
							</button>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

{#snippet face(date: string, count: number, slip: boolean)}
	<span>{Number(date.slice(8))}</span>
	{#if count > 0}
		<span class="flex items-center gap-0.5 text-xs leading-none">
			<span
				aria-hidden="true"
				class={[
					'size-1.5 rounded-full',
					slip ? 'bg-terracotta' : 'bg-forest',
					date === selected && 'bg-white'
				]}
			></span>
			{#if count > 1}{count}{/if}
		</span>
	{/if}
{/snippet}
