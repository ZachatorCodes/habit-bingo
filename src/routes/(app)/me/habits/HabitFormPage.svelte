<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Hero from '#lib/components/ui/Hero.svelte';
	import HabitForm from '#lib/components/habits/HabitForm.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { HabitInput } from '#lib/game/types.ts';

	type Props = {
		title: string;
		lede: string;
		values: HabitInput;
		errors: Record<string, string>;
		submitLabel: string;
		action?: string;
		/** Extra content below the form, such as the archive button on the edit page. */
		footer?: Snippet;
	};
	let { title, lede, values, errors, submitLabel, action, footer }: Props = $props();
</script>

<Seo {title} description={lede} path="/me/habits" noindex />

<Hero {title} summary={lede} />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5 md:max-w-[640px]">
		<a
			href={resolve('/(app)/me/habits')}
			class="inline-flex min-h-11 items-center gap-1 font-bold text-forest underline-offset-4 hover:underline"
			><Icon name="arrow-left" /> Habit library</a
		>

		{#if errors.form}
			<p role="alert" class="rounded-row bg-risk-tile px-4 py-3 font-bold">
				<Icon name="warning" />
				{errors.form}
			</p>
		{/if}

		<!--
			novalidate: the server validates every field. Without JavaScript the target's min/max come from
			the page's initial kind and period, so the browser's own check would silently block valid
			combinations (e.g. 8 a day while max still says 7 a week).
		-->
		<form
			method="POST"
			novalidate
			{action}
			use:enhance={({ formElement }) =>
				async ({ update }) => {
					await update({ reset: false });
					formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
				}}
		>
			{#key values}
				<HabitForm {values} {errors} {submitLabel} />
			{/key}
		</form>
	</div>
</section>

{@render footer?.()}
