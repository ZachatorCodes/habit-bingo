<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/Icon.svelte';
	import { monthName } from '#lib/game/calendar.ts';
	import { REACTIONS, type ReactionIcon } from '#lib/game/feed.ts';
	import type { FeedItem } from '#lib/game/types.ts';

	let { item, groupId, now }: { item: FeedItem; groupId: string; now: Date } = $props();

	// Optimistic choice while the POST is in flight; undefined means "use the server's".
	let pending = $state<ReactionIcon | null | undefined>();
	const mine = $derived(pending === undefined ? item.mine : pending);
	const count = (icon: ReactionIcon) =>
		item.reactions[icon] - (item.mine === icon ? 1 : 0) + (mine === icon ? 1 : 0);

	const name = $derived(item.author.displayUsername ?? 'Someone');
	const shortDay = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const text = $derived.by(() => {
		const p = item.payload;
		if (item.type === 'squareComplete')
			return p.private ? 'completed a private habit' : `completed ${p.name}`;
		if (item.type === 'checkIn') {
			const what = p.private ? 'a private habit' : String(p.name);
			const times = Number(p.count) > 1 ? ` ×${p.count}` : '';
			const day = p.backfilled ? ` for ${shortDay.format(new Date(`${p.date}T00:00:00Z`))}` : '';
			return `logged ${what}${times}${day}`;
		}
		if (item.type === 'bingo') return 'got a bingo!';
		if (item.type === 'blackout') return 'got a blackout!';
		if (item.type === 'sixtyPercent')
			return p.squares ? `reached ${p.squares} squares` : 'reached their middle reward';
		return `started their ${monthName(String(p.month))} card`;
	});

	const ago = $derived.by(() => {
		const s = (now.getTime() - new Date(item.createdAt).getTime()) / 1000;
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
		return new Date(item.createdAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	});
</script>

<li class="flex flex-col gap-2 rounded-row bg-page p-3">
	<div class="flex items-center gap-3">
		<a
			href={resolve('/(app)/groups/[id]/members/[userId]', {
				id: groupId,
				userId: item.author.userId
			})}
			class="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
		>
			<span
				aria-hidden="true"
				class="grid size-10 shrink-0 place-items-center rounded-full bg-earned-tile text-2xl text-forest"
				><Icon name={item.author.avatarIcon} /></span
			>
			<span class="min-w-0 flex-1"
				><span class="font-bold">@{name}</span>
				{text}</span
			>
		</a>
		<time datetime={new Date(item.createdAt).toISOString()} class="shrink-0 text-sm text-muted"
			>{ago}</time
		>
	</div>
	<div class="flex flex-wrap gap-1">
		{#each REACTIONS as icon (icon)}
			{@const n = count(icon)}
			<form
				method="POST"
				action="?/react"
				use:enhance={() => {
					pending = mine === icon ? null : icon;
					return async ({ update }) => {
						await update({ reset: false });
						pending = undefined;
					};
				}}
			>
				<input type="hidden" name="eventId" value={item.id} />
				<input type="hidden" name="icon" value={icon} />
				<button
					type="submit"
					aria-label={`React with ${icon.replace('-', ' ')}, ${n}${mine === icon ? ', you reacted' : ''}`}
					class="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink {mine ===
					icon
						? 'border-forest bg-earned-tile text-forest ring-2 ring-forest'
						: 'border-line bg-surface text-muted'}"
				>
					<Icon name={icon} />{#if n > 0}<span class="text-sm font-bold tabular-nums">{n}</span
						>{/if}
				</button>
			</form>
		{/each}
	</div>
</li>
