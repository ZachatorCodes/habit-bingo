<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { CATEGORIES, type CategoryId } from '#lib/game/categories.ts';

	type Props = {
		selected: CategoryId | null;
		counts: Record<CategoryId, number>;
		archived: boolean;
	};
	let { selected, counts, archived }: Props = $props();

	const total = $derived(Object.values(counts).reduce((sum, n) => sum + n, 0));

	/** The query string for a filter link; the path is resolved inline where the link is built. */
	function query(category: CategoryId | null): string {
		const parts = [category ? `category=${category}` : '', archived ? 'archived=1' : ''].filter(
			Boolean
		);
		return parts.length ? `?${parts.join('&')}` : '';
	}

	const chip =
		'inline-flex min-h-11 items-center gap-1.5 rounded-full lg:flex lg:w-full border px-3.5 text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest';
</script>

<!-- Links are resolve()d paths plus a query string, which the lint rule cannot follow. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<nav aria-label="Filter by category" class="lg:sticky lg:top-4">
	<ul class="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
		<li>
			<a
				href={resolve('/(app)/me/habits') + query(null)}
				aria-current={selected === null ? 'page' : undefined}
				class={[
					chip,
					selected === null ? 'border-forest bg-forest text-white' : 'border-line bg-surface'
				]}>All <span class="font-semibold">{total}</span></a
			>
		</li>
		{#each CATEGORIES.filter((c) => counts[c.id] > 0 || c.id === selected) as category (category.id)}
			<li>
				<a
					href={resolve('/(app)/me/habits') + query(category.id)}
					aria-current={selected === category.id ? 'page' : undefined}
					class={[
						chip,
						selected === category.id
							? 'border-forest bg-forest text-white'
							: 'border-line bg-surface'
					]}
					><Icon name={category.icon} />
					{category.label}
					<span class="font-semibold">{counts[category.id]}</span></a
				>
			</li>
		{/each}
	</ul>
</nav>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
