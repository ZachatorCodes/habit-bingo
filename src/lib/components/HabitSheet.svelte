<script lang="ts" module>
	import type { SquareState } from '#lib/game/square-state.ts';

	/** One habit square as the habit sheet shows it (spec §4.6). */
	export type SheetData = {
		id: string;
		icon: string;
		name: string;
		/** "Health" */
		category: string;
		/** "8 times a day" */
		rule: string;
		/** `times` gets a stepper, `days` a "Done that day" toggle. */
		countMode: 'times' | 'days';
		period: 'day' | 'week' | 'month';
		state: SquareState;
		progress: number;
		/** Counts toward lines, tiers and points now. */
		counting: boolean;
		stateText: string;
		progressText: string;
		today: string;
		/** The day being logged. */
		day: string;
		/** That day's count. */
		count: number;
		/** The card's month: every date with its count, and whether it can be logged. */
		calendar: {
			month: string;
			weekStartsOn: 'monday' | 'sunday';
			direction: 'atLeast' | 'atMost';
			days: Record<string, { count: number; loggable: boolean }>;
		};
	};
</script>

<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { burst, tap } from '#lib/celebrate.ts';
	import { monthName, weekday } from '#lib/game/calendar.ts';
	import Plus from 'phosphor-svelte/lib/Plus';
	import MonthCalendar from './MonthCalendar.svelte';
	import ProgressRing from './ProgressRing.svelte';
	import Toast from './Toast.svelte';

	type Props = {
		data: SheetData;
		/** Shows the habit's name as the page heading (the page; a dialog already has it as its title). */
		titled?: boolean;
		/** Shown over the card: day links and saves refresh the sheet in place through this. */
		onnavigate?: (href: string) => Promise<void>;
	};

	let { data, titled = false, onnavigate }: Props = $props();

	const RING = {
		empty: 'open',
		inProgress: 'progress',
		complete: 'earned',
		held: 'protected',
		atRisk: 'risk',
		lost: 'lost',
		free: 'open',
		buildNext: 'open'
	} as const;
	const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const base = $derived(resolve('/(app)/card/squares/[id]', { id: data.id }));
	const dayQuery = (day: string) => (day === data.today ? '' : `?day=${day}`);
	/** The count shown while a change is on its way; null shows the server's. */
	let pending = $state<number | null>(null);
	/** Saves still on their way: the optimistic count stays until the last one settles. */
	let saving = 0;
	const settle = () => {
		if (--saving === 0) pending = null;
	};
	const count = $derived(pending ?? data.count);
	const dayTitle = $derived(
		`${WEEKDAYS[weekday(data.day)]}, ${monthName(data.calendar.month).slice(0, 3)} ${Number(data.day.slice(8))}: ${count} logged`
	);
	let root = $state<HTMLElement>();
	let toast = $state<{ id: number; text: string } | null>(null);

	function optimistic(next: () => number): SubmitFunction {
		return ({ submitter }) => {
			const hadFocus = submitter === document.activeElement;
			const before = count;
			saving++;
			pending = next();
			if (pending > before) {
				tap();
				const box = submitter?.getBoundingClientRect();
				if (box) {
					void burst(
						{
							x: (box.left + box.width / 2) / window.innerWidth,
							y: (box.top + box.height / 2) / window.innerHeight
						},
						prefersReducedMotion.current
					);
				}
			}
			return async ({ result, update }) => {
				if (result.type === 'failure' || result.type === 'error') {
					settle();
					const message =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: "Couldn't save that. Try again.";
					toast = { id: (toast?.id ?? 0) + 1, text: message };
					return;
				}
				// The action redirects back to this sheet; refresh in place instead of navigating.
				if (result.type === 'redirect') {
					if (onnavigate) await onnavigate(`${base}${dayQuery(data.day)}`);
					else await invalidateAll();
				} else {
					await update();
				}
				settle();
				// A disabled − (at zero) drops focus: hand it to + so the keyboard stays in the stepper.
				if (hadFocus && (submitter as HTMLButtonElement).disabled) {
					await tick();
					root?.querySelector<HTMLElement>('[data-primary]')?.focus();
				}
			};
		};
	}

	const action = (name: string) =>
		`${base}?/${name}${data.day === data.today ? '' : `&day=${data.day}`}`;
	const round =
		'grid size-12 place-items-center rounded-full text-2xl font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40';
</script>

<div class="mt-4 flex flex-col gap-5" bind:this={root}>
	<div class="flex items-center gap-4">
		<ProgressRing
			icon={data.icon}
			variant={RING[data.state]}
			percent={Math.round(data.progress * 100)}
			size="lg"
		/>
		<div class="flex min-w-0 flex-col gap-0.5">
			{#if titled}<h1 class="text-xl leading-tight font-extrabold">{data.name}</h1>{/if}
			<p class="text-[13px] font-semibold text-muted">{data.category} · {data.rule}</p>
			<p class="font-bold">{data.stateText}</p>
			<p class="text-[13px] font-semibold text-muted">{data.progressText}</p>
			{#if data.calendar.direction === 'atMost' && data.state !== 'lost' && !data.counting}
				<p class="text-[13px] font-semibold text-muted">
					Counts at the end of the month if you stay under.
				</p>
			{/if}
			{#if data.calendar.direction === 'atLeast' && data.period !== 'month' && (data.state === 'held' || data.state === 'atRisk') && !data.counting}
				<p class="text-[13px] font-semibold text-muted">
					Counts at the end of the month if you keep it up.
				</p>
			{/if}
		</div>
	</div>

	<MonthCalendar
		month={data.calendar.month}
		weekStartsOn={data.calendar.weekStartsOn}
		direction={data.calendar.direction}
		today={data.today}
		selected={data.day}
		days={data.calendar.days}
		href={onnavigate ? undefined : (date) => `${base}${dayQuery(date)}`}
		onselect={(date) => void onnavigate?.(`${base}${dayQuery(date)}`)}
	/>
	<h3 class="text-sm font-extrabold">{dayTitle}</h3>

	{#if data.countMode === 'times'}
		<div class="flex items-center gap-4">
			<form
				method="POST"
				action={action('unlog')}
				use:enhance={optimistic(() => Math.max(count - 1, 0))}
			>
				<input type="hidden" name="date" value={data.day} />
				<button
					type="submit"
					aria-label="Remove one"
					disabled={count === 0}
					class={[round, 'bg-page text-muted']}>−</button
				>
			</form>
			<output aria-label="Count" class="min-w-10 text-center text-3xl font-extrabold tabular-nums"
				>{count}</output
			>
			<form
				method="POST"
				action={action('log')}
				use:enhance={optimistic(() => Math.min(count + 1, 20))}
			>
				<input type="hidden" name="date" value={data.day} />
				<button
					type="submit"
					data-primary
					aria-label="Add one"
					class={[round, 'bg-terracotta text-white']}
					><Plus weight="bold" aria-hidden="true" /></button
				>
			</form>
		</div>
	{:else}
		<form method="POST" action={action('set')} use:enhance={optimistic(() => (count > 0 ? 0 : 1))}>
			<input type="hidden" name="date" value={data.day} />
			<input type="hidden" name="count" value={count > 0 ? 0 : 1} />
			<button
				type="submit"
				aria-pressed={count > 0}
				class={[
					'rounded-2xl px-4 py-2.5 font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink',
					count > 0 ? 'bg-earned-tile text-forest' : 'bg-terracotta text-white'
				]}><span aria-hidden="true">{count > 0 ? '✓' : '○'}</span> Done that day</button
			>
		</form>
	{/if}
</div>

<Toast message={toast} />
