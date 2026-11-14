<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import HabitFormPage from '../HabitFormPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<HabitFormPage
	title={`Edit ${data.name}`}
	lede="Changes apply to cards you build from now on."
	values={form?.values ?? data.values}
	errors={form?.errors ?? {}}
	submitLabel="Save habit"
	action="?/save"
>
	{#snippet footer()}
		<section class="relative mt-4 rounded-[24px] bg-surface shadow-sheet">
			<form
				method="POST"
				action="?/archive"
				class="mx-auto flex max-w-2xl flex-col items-start gap-3 px-4 py-5"
			>
				<p class="text-muted">
					Archiving hides it from new cards. You can restore it from the archived view.
				</p>
				<button
					type="submit"
					class="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest"
					><Icon name="archive" /> Archive</button
				>
			</form>
		</section>
	{/snippet}
</HabitFormPage>
