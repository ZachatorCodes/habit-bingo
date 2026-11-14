<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import { afterNavigate, goto, preloadData, pushState, replaceState } from '$app/navigation';
	import CardBoard from '#lib/components/card/CardBoard.svelte';
	import HabitSheet from '#lib/components/card/HabitSheet.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import BingoCelebration from '#lib/components/card/BingoCelebration.svelte';
	import { CARD_SIZES } from '#lib/game/card-layout.ts';
	import { newlyCompleted } from '#lib/game/celebrate.ts';
	import type { CardScore, Tier } from '#lib/game/score.ts';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import CardHeader from '#lib/components/card/CardHeader.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const started = $derived(page.url.searchParams.get('started') === '1');
	const saved = $derived(page.url.searchParams.get('saved') === '1');
	const planned = $derived(page.url.searchParams.get('planned') === '1');
	const message = $derived(
		form && 'message' in form
			? form.message
			: page.url.searchParams.get('locked') === '1'
				? 'This card is locked.'
				: null
	);

	// Squares open their habit sheet over the card (shallow routing): the URL changes, the back button
	// closes it, and without JavaScript the link simply opens the sheet's own page.
	let opening = false;
	async function openSheet(event: MouseEvent, href: string) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		// One sheet at a time: a second tap while one is open or loading does nothing.
		if (page.state.sheet || opening) return;
		opening = true;
		const result = await preloadData(href).finally(() => (opening = false));
		if (result.type === 'loaded' && result.status === 200) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- href was built with resolve()
			pushState(href, { sheet: result.data.sheet as App.PageState['sheet'] });
		} else {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- href was built with resolve()
			await goto(href);
		}
	}

	// The card behind an open sheet, refreshed after a change; real navigations bring fresh data.
	let fresh = $state<typeof data.card | null>(null);
	const card = $derived(fresh ?? data.card);

	// BINGO! (spec §4.7): when a log here completes a new line or reward tier. Only gains in this tab
	// celebrate; a page load or a drop never does.
	let celebration = $state<{ lines: number[][]; tiers: Tier[] } | null>(null);
	let lastScore: CardScore | null = null;
	$effect(() => {
		const score = card?.score;
		if (!score) return;
		if (lastScore) {
			const gained = newlyCompleted(lastScore, score);
			if (gained.lines.length > 0 || gained.tiers.length > 0) {
				celebration = gained;
				// Completed from the habit sheet: close it so the board's ripple shows.
				closeSheet();
			}
		}
		lastScore = score;
	});
	// Closing the sheet steps back past its history entry — once, even if ✕ and a celebration both
	// ask at the same moment (stepping back twice would leave the card).
	let closing = false;
	function closeSheet() {
		if (!page.state.sheet || closing) return;
		closing = true;
		history.back();
	}
	$effect(() => {
		// Any change of history state ends a close in progress.
		void page.state.sheet;
		closing = false;
	});

	afterNavigate(() => (fresh = null));

	// After a change (or another day picked) inside the sheet: reload it and the card behind it.
	// (invalidateAll would rerun the sheet route's own load, since the URL is the sheet's.)
	let refreshes = 0;
	async function refreshSheet(href: string) {
		const mine = ++refreshes;
		// preloadData reuses what it already loaded for a URL, so ask for a fresh copy.
		const fresher = (url: string) => `${url}${url.includes('?') ? '&' : '?'}refresh=${Date.now()}`;
		const [sheet, cardPage] = await Promise.all([
			preloadData(fresher(href)),
			preloadData(fresher(resolve('/(app)/card')))
		]);
		// Only the newest refresh counts, and not once the sheet has closed.
		if (mine !== refreshes) return;
		if (page.state.sheet && sheet.type === 'loaded' && sheet.status === 200) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- href was built with resolve()
			replaceState(href, { sheet: sheet.data.sheet as App.PageState['sheet'] });
		}
		if (cardPage.type === 'loaded' && cardPage.status === 200) {
			fresh = cardPage.data.card as typeof data.card;
		}
	}
</script>

<Seo
	title="Your card"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

{#if card}
	<CardHeader
		monthName={data.monthName}
		daysLeft={data.daysLeft}
		score={card.score}
		size={card.size}
		rewards={card.rewards}
		states={card.squares.map((square) => square.state)}
		counting={card.squares.map((square) => square.counting)}
	>
		{#if started}
			<Notice tone="success">Card started!</Notice>
		{/if}
		{#if planned}
			<Notice tone="success"
				>{data.nextMonthName} card saved. It starts {data.nextMonthName} 1.</Notice
			>
		{/if}
		{#if saved}
			<Notice tone="success">Changes saved.</Notice>
		{/if}
		{#if message}
			<Notice tone="error">{message}</Notice>
		{/if}

		<CardBoard
			size={card.size}
			squares={card.squares}
			onopen={openSheet}
			highlight={celebration?.lines}
		/>
	</CardHeader>

	{#if celebration}
		<!-- A new gain remounts it, so each celebration runs from the start. -->
		{#key celebration}
			<BingoCelebration
				lines={celebration.lines}
				tiers={celebration.tiers}
				rewards={card.rewards}
				sixtyThreshold={CARD_SIZES[card.size].sixtyThreshold}
				ondone={() => (celebration = null)}
			/>
		{/key}
	{/if}

	{#if page.state.sheet}
		<Sheet title={page.state.sheet.name} onclose={closeSheet}>
			<HabitSheet data={page.state.sheet} onnavigate={refreshSheet} />
		</Sheet>
	{/if}

	{#if data.editable && data.deadline}
		<div class="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6">
			<p class="text-muted">{data.deadline}.</p>
			<form method="POST" action="?/edit" use:enhance>
				<Button type="submit" variant="secondary">Edit card</Button>
			</form>
		</div>
	{/if}
{:else}
	<Hero title="Your card" summary="No card for {data.monthName} yet." />
	<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
		<div class="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-10 text-center">
			<Icon name="plant" size={48} class="text-forest" />
			<p class="text-muted">Build this month's card to start checking in.</p>
			<Button href={resolve('/(app)/card/build')}
				>{data.hasDraft ? 'Continue building' : 'Build your card'}</Button
			>
		</div>
	</section>
{/if}
