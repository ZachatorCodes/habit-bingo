<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const summary = $derived(
		data.groups.length === 0
			? 'No groups yet'
			: `${data.groups.length} ${data.groups.length === 1 ? 'group' : 'groups'}`
	);
</script>

<Seo title="Groups" description="Your Habit Bingo groups." path="/groups" noindex />

<Hero title="Groups" {summary} />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 lg:max-w-5xl">
		{#if data.groups.length === 0}
			<div class="flex flex-col items-start gap-3 rounded-row border border-dashed border-line p-5">
				<p class="flex items-center gap-2 font-bold">
					<Icon name="users-three" class="text-forest" /> No groups yet. Create one, or ask a friend for
					their invite link.
				</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-2 md:grid md:grid-cols-2 xl:grid-cols-3">
				{#each data.groups as group (group.id)}
					<li>
						<a
							href={resolve('/(app)/groups/[id]', { id: group.id })}
							class="flex min-h-14 items-center gap-3 rounded-row bg-page p-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
						>
							<span
								aria-hidden="true"
								class="grid size-10 shrink-0 place-items-center rounded-full bg-earned-tile text-2xl text-forest"
								><Icon name={group.icon} /></span
							>
							<span class="min-w-0 flex-1 truncate font-bold">{group.name}</span>
							<span class="text-sm text-muted"
								>{group.memberCount}
								{group.memberCount === 1 ? 'member' : 'members'}</span
							>
							<Icon name="caret-right" class="text-muted" />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<Button href={resolve('/(app)/groups/new')} class="w-full">Create a group</Button>
	</div>
</section>
