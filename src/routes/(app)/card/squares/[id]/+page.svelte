<script lang="ts">
	import { resolve } from '$app/paths';
	import HabitSheet from '#lib/components/card/HabitSheet.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Seo
	title={data.sheet.name}
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<!-- The habit sheet as a page: without JavaScript, or when opened directly. -->
<section class="mx-auto flex max-w-lg flex-col gap-2 px-4 py-10">
	<a
		href={resolve('/(app)/card')}
		class="self-start font-bold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
		>Back to card</a
	>
	<HabitSheet data={data.sheet} titled />
</section>
