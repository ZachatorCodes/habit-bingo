<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import { describeRule } from '#lib/game/habit-rules.ts';
	import { STARTERS } from '#lib/game/starters.ts';

	type Props = {
		addedIds: string[];
		/**
		 * The page's own query (e.g. "&category=fitness"), appended to form actions: an action URL
		 * like "?/archive" replaces the query, so without it the page would lose its view after posting.
		 */
		keep?: string;
	};
	let { addedIds, keep = '' }: Props = $props();

	/** Starters being added right now, so a second tap does nothing while the first is in flight. */
	let pending = $state<string[]>([]);
</script>

<section
	aria-labelledby="quick-start-heading"
	class="relative mt-4 rounded-[24px] bg-surface shadow-sheet"
>
	<div class="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5">
		<div>
			<h2 id="quick-start-heading" class="text-xl font-extrabold">Quick start</h2>
			<p class="text-muted">Tap to add. You can change them later.</p>
		</div>
		<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			{#each STARTERS as starter (starter.id)}
				{@const added = addedIds.includes(starter.id)}
				<li>
					<form
						method="POST"
						action={`?/addStarter${keep}`}
						use:enhance={() => {
							pending = [...pending, starter.id];
							return async ({ update }) => {
								await update({ reset: false });
								pending = pending.filter((id) => id !== starter.id);
							};
						}}
					>
						<input type="hidden" name="starterId" value={starter.id} />
						<button
							type="submit"
							disabled={added || pending.includes(starter.id)}
							aria-label={added ? `${starter.name} added` : `Add ${starter.name}`}
							class="flex min-h-11 w-full items-center gap-3 rounded-row border border-line bg-surface p-3 text-left transition-transform focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:bg-earned-tile motion-safe:active:scale-[0.98]"
						>
							<ProgressRing icon={starter.icon} variant={added ? 'earned' : 'open'} size="sm" />
							<span class="min-w-0 flex-1">
								<span class="block font-bold">{starter.name}</span>
								<span class="block text-sm text-muted">{describeRule(starter.rule)}</span>
							</span>
							{#if added}
								<span class="inline-flex items-center gap-1 text-sm font-bold text-forest"
									><Icon name="check-circle" /> Added</span
								>
							{:else}
								<span class="rounded-full bg-forest px-3 py-1 text-sm font-bold text-white"
									>+ Add</span
								>
							{/if}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</div>
</section>
