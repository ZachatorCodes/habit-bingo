<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import { CARD_SIZES, type CardSize } from '#lib/game/card-layout.ts';

	type Props = { selected: CardSize | null; habitCount: number; errorId?: string };
	let { selected, habitCount, errorId }: Props = $props();

	const sizes: CardSize[] = [3, 5];
</script>

<fieldset
	class="flex flex-col gap-3"
	role="radiogroup"
	aria-invalid={errorId ? 'true' : undefined}
	aria-describedby={errorId}
>
	<legend class="mb-1.5 text-xl font-extrabold">Card size</legend>
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		{#each sizes as size (size)}
			{@const need = CARD_SIZES[size].habits}
			<label
				class="group relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-2xl border-2 border-line bg-surface p-4 has-[:checked]:border-forest has-[:checked]:bg-earned-tile has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest"
			>
				<input type="radio" name="size" value={size} checked={selected === size} class="sr-only" />
				<Check
					weight="bold"
					size={20}
					aria-hidden="true"
					class="absolute top-3 right-3 hidden text-forest group-has-[:checked]:block"
				/>
				<span class="text-xl font-extrabold">{size}×{size}</span>
				<span class="font-bold">{need} habits</span>
				<span class="text-sm text-muted">You have {habitCount} habits / need {need}</span>
				{#if habitCount < need}
					<span class="text-sm font-bold">Add {need - habitCount} more in the next step.</span>
				{/if}
			</label>
		{/each}
	</div>
</fieldset>
