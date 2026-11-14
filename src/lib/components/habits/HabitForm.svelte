<script lang="ts">
	import { resolve } from '$app/paths';
	import BingoSquare from '#lib/components/card/BingoSquare.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconPicker from '#lib/components/ui/IconPicker.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { CATEGORIES, type CategoryId } from '#lib/game/categories.ts';
	import { CATEGORY_ICON, FALLBACK_ICON } from '#lib/game/icons.ts';
	import {
		defaultCountMode,
		describeRule,
		normalizeRule,
		targetRange,
		type CountMode,
		type Direction,
		type Period
	} from '#lib/game/habit-rules.ts';
	import type { HabitInput } from '#lib/game/types.ts';

	type Props = {
		values: HabitInput;
		errors?: Record<string, string>;
		submitLabel: string;
	};
	let { values, errors = {}, submitLabel }: Props = $props();

	// svelte-ignore state_referenced_locally
	let picked = $state(values.icon);
	// svelte-ignore state_referenced_locally
	let name = $state(values.name);
	// svelte-ignore state_referenced_locally
	let category = $state(values.category);
	// svelte-ignore state_referenced_locally
	let direction = $state(values.direction as Direction);
	// svelte-ignore state_referenced_locally
	let period = $state(values.period as Period);
	// svelte-ignore state_referenced_locally
	let countMode = $state((values.countMode ?? defaultCountMode(direction)) as CountMode);
	// svelte-ignore state_referenced_locally
	let target = $state<string | number>(values.target);
	// svelte-ignore state_referenced_locally
	let isPrivate = $state(values.isPrivate);
	/** Once the person picks a count mode, switching kind no longer overrides it. */
	let countModePicked = $state(false);

	function trackTyping(event: Event) {
		const input = event.target;
		if (!(input instanceof HTMLInputElement)) return;
		if (input.name === 'name') name = input.value;
		else if (input.name === 'target') target = input.value;
	}

	function setDirection(next: Direction) {
		direction = next;
		if (!countModePicked) countMode = defaultCountMode(next);
	}

	const range = $derived(targetRange(direction, period, period === 'day' ? 'times' : countMode));
	const preview = $derived(normalizeRule({ direction, period, countMode, target }));

	// Until the person picks, the icon follows the category.
	const icon = $derived(picked || (CATEGORY_ICON[category as CategoryId] ?? FALLBACK_ICON));

	const ids = $props.id();
	const field = 'flex flex-col gap-1.5';
	const select =
		'w-full min-h-11 rounded-input border border-line bg-surface px-4 py-2.5 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest';
	const choice =
		'group flex min-h-11 cursor-pointer items-center gap-2 rounded-row border border-line bg-surface px-3 py-2 font-bold has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest';
	const tile =
		'group flex min-h-11 cursor-pointer items-center gap-2 rounded-row border border-line bg-surface px-3 py-3 font-bold has-[:checked]:border-forest has-[:checked]:bg-earned-tile has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest';
</script>

{#snippet fieldError(key: string)}
	{#if errors[key]}
		<p id={`${ids}-${key}-error`} class="text-sm font-bold">
			<Icon name="warning" />
			{errors[key]}
		</p>
	{/if}
{/snippet}

<!-- TextField values are one-way; typing is tracked from bubbling input events. -->
<div class="flex flex-col gap-6" oninput={trackTyping}>
	<fieldset class={field} aria-describedby={errors.category ? `${ids}-category-error` : undefined}>
		<legend class="mb-1.5 font-extrabold">Category</legend>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each CATEGORIES as option (option.id)}
				<label class={choice}>
					<input
						type="radio"
						name="category"
						value={option.id}
						bind:group={category}
						class="sr-only"
					/>
					<Icon name={option.icon} />
					{option.label}
					<Icon name="check-circle" class="ml-auto hidden group-has-[:checked]:inline" />
				</label>
			{/each}
		</div>
		{@render fieldError('category')}
	</fieldset>

	<TextField label="Name" name="name" value={name} error={errors.name} hint="e.g. Go biking" />

	<IconPicker
		name="icon"
		groups
		error={errors.icon}
		bind:value={() => icon, (next) => (picked = next)}
	/>

	<fieldset
		class={field}
		aria-describedby={errors.direction ? `${ids}-direction-error` : undefined}
	>
		<legend class="mb-1.5 font-extrabold">Kind</legend>
		<div class="grid grid-cols-2 gap-2">
			<label class={tile}>
				<input
					type="radio"
					name="direction"
					value="atLeast"
					checked={direction === 'atLeast'}
					onchange={() => setDirection('atLeast')}
					class="sr-only"
				/>
				<Icon name="check-circle" class="text-xl text-forest" />
				Do it
			</label>
			<label class={tile}>
				<input
					type="radio"
					name="direction"
					value="atMost"
					checked={direction === 'atMost'}
					onchange={() => setDirection('atMost')}
					aria-describedby={`${ids}-limit-hint`}
					class="sr-only"
				/>
				<Icon name="prohibit" class="text-xl text-terracotta" />
				Limit it
			</label>
		</div>
		<p id={`${ids}-limit-hint`} class="text-sm text-muted">
			Limit it counts slips, like eating out.
		</p>
		{@render fieldError('direction')}
	</fieldset>

	<fieldset class={field}>
		<legend class="mb-1.5 font-extrabold">How often</legend>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<TextField
				label="How many"
				name="target"
				type="number"
				value={target}
				min={range.min}
				max={range.max}
				error={errors.target}
			/>
			<div class={field}>
				<label for={`${ids}-period`} class="font-extrabold">Per</label>
				<select
					id={`${ids}-period`}
					name="period"
					bind:value={period}
					aria-invalid={errors.period ? 'true' : undefined}
					aria-describedby={errors.period ? `${ids}-period-error` : undefined}
					class={select}
				>
					<option value="day">a day</option>
					<option value="week">a week</option>
					<option value="month">a month</option>
				</select>
				{@render fieldError('period')}
			</div>
			{#if period !== 'day'}
				<div class={field}>
					<label for={`${ids}-count`} class="font-extrabold">Counting</label>
					<select
						id={`${ids}-count`}
						name="countMode"
						bind:value={countMode}
						onchange={() => (countModePicked = true)}
						class={select}
					>
						<option value="times">times</option>
						<option value="days">different days</option>
					</select>
				</div>
			{/if}
		</div>
	</fieldset>

	<label class="flex min-h-11 items-start gap-3 font-bold">
		<input
			type="checkbox"
			name="isPrivate"
			bind:checked={isPrivate}
			class="mt-0.5 size-6 accent-forest"
		/>
		<span class="min-w-0 flex-1"
			>Private: friends see <span class="inline-flex align-[-0.125em]"><Icon name="lock" /></span
			><span class="sr-only"> a lock</span> instead of the name</span
		>
	</label>

	<section aria-label="Preview" class="flex items-center gap-4 rounded-row bg-page p-4">
		<div class="w-24 shrink-0">
			<BingoSquare {icon} label={name.trim() || 'Your habit'} state="empty" showLabel />
		</div>
		<p class="font-bold">
			{preview.ok ? describeRule(preview.rule) : 'Finish the details to see how it reads.'}
		</p>
	</section>

	<div class="flex flex-wrap items-center gap-3">
		<Button type="submit">{submitLabel}</Button>
		<a
			href={resolve('/(app)/me/habits')}
			class="inline-flex min-h-11 items-center rounded-full px-4 font-extrabold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest"
			>Cancel</a
		>
	</div>
</div>
