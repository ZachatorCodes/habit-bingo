<script lang="ts">
	import { resolve } from '$app/paths';
	import CardBoard from '#lib/components/card/CardBoard.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { CardSize } from '#lib/game/card-layout.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<Seo
	title={`@${data.member.displayUsername}`}
	description="A group member's card."
	path={`/groups/${data.groupId}/members/${data.userId}`}
	noindex
/>

<Hero
	title={`@${data.member.displayUsername}'s card`}
	summary={data.card
		? `${data.monthName} · ${plural(data.card.score.lines.length, 'line')} · ${data.card.score.percent}% complete`
		: data.monthName}
>
	<span
		aria-hidden="true"
		class="mt-3 grid size-12 place-items-center rounded-full bg-earned-tile text-3xl text-forest"
		><Icon name={data.member.avatarIcon} /></span
	>
</Hero>

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
		<a
			href={resolve('/(app)/groups/[id]', { id: data.groupId })}
			class="inline-flex min-h-11 items-center gap-1 font-bold text-forest underline-offset-4 hover:underline"
			><Icon name="arrow-left" /> Group</a
		>

		{#if data.card}
			<div class="lg:max-w-[640px]">
				<CardBoard size={data.card.size as CardSize} squares={data.card.squares} />
			</div>
		{:else}
			<p class="text-lg text-muted">No {data.monthName} card yet.</p>
		{/if}
	</div>
</section>
