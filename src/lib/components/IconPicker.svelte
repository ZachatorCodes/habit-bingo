<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { CATEGORIES } from '#lib/game/categories.ts';
	import { ICONS, isPickableIcon, type IconName } from '#lib/game/icons.ts';

	type Props = {
		name: string;
		value: string;
		options?: readonly IconName[];
		/** Visible group label. */
		label?: string;
		/** Shown under the grid and linked to the group. */
		error?: string;
		/** Show the options under category subheadings instead of one flat grid. */
		groups?: boolean;
	};

	let {
		name,
		value = $bindable(),
		options = ICONS.map((icon) => icon.name).filter(isPickableIcon),
		label = 'Icon',
		error,
		groups = false
	}: Props = $props();

	const labelId = $props.id();
	const errorId = `${labelId}-error`;

	const entries = $derived(options.map((n) => ICONS.find((icon) => icon.name === n)!));
	const sections = $derived(
		groups
			? CATEGORIES.map((c) => ({
					title: c.label,
					icons: entries.filter((icon) => icon.group === c.id)
				})).filter((s) => s.icons.length)
			: [{ title: '', icons: entries }]
	);
</script>

{#snippet tile(icon: (typeof ICONS)[number])}
	<label class="relative block">
		<input
			type="radio"
			{name}
			value={icon.name}
			aria-label={icon.label}
			bind:group={value}
			class="peer sr-only"
		/>
		<span
			aria-hidden="true"
			class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-row bg-surface py-2.5 text-2xl text-forest ring-1 ring-line peer-checked:bg-earned-tile peer-checked:ring-2 peer-checked:ring-forest peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest"
		>
			<Icon name={icon.name} />
		</span>
		<!-- Selection is shown by a mark as well as the ring. -->
		<span
			aria-hidden="true"
			class="pointer-events-none absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-forest text-xs font-bold text-surface peer-checked:flex"
			>✓</span
		>
	</label>
{/snippet}

<!-- Native radios: one tab stop, arrow keys move and select, and it posts without JavaScript. -->
<div class="flex flex-col gap-1.5">
	<span id={labelId} class="font-extrabold">{label}</span>
	<div
		role="radiogroup"
		aria-labelledby={labelId}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? errorId : undefined}
		class="flex flex-col gap-3"
	>
		{#each sections as section (section.title)}
			<div class="flex flex-col gap-1.5">
				{#if groups}
					<span class="text-sm font-bold text-muted">{section.title}</span>
				{/if}
				<!-- Seven across at every width: each category is exactly two rows of 14. -->
				<div class="grid grid-cols-7 gap-2">
					{#each section.icons as icon (icon.name)}
						{@render tile(icon)}
					{/each}
				</div>
			</div>
		{/each}
	</div>
	{#if error}
		<p id={errorId} class="text-sm font-bold text-ink">
			<Icon name="warning" />
			{error}
		</p>
	{/if}
</div>
