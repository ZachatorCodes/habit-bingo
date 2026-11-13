<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? 'Page not found' : 'Something went wrong'} · Habit Bingo</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Hero
	title={notFound ? 'Page not found' : 'Something went wrong'}
	summary={notFound
		? "That square isn't on the board."
		: 'Sorry about that. Please try again in a moment.'}
/>

<div class="relative -mt-[18px] pb-4">
	<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
		<div class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-6 text-center">
			<ProgressRing icon={notFound ? 'map-trifold' : 'warning'} variant="open" size="lg" />
			{#if page.error?.errorId}
				<p class="text-[11px] text-muted">Reference: {page.error.errorId}</p>
			{/if}
			<Button href={resolve('/')}>Go home</Button>
		</div>
	</section>
</div>
