<script lang="ts">
	import { page } from '$app/state';

	type Props = { title: string; description: string; path: string; noindex?: boolean };
	let { title, description, path, noindex = false }: Props = $props();

	const fullTitle = $derived(`${title} · Habit Bingo`);
	const url = $derived(new URL(path, page.url.origin).href);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Habit Bingo" />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta name="twitter:card" content="summary" />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>
