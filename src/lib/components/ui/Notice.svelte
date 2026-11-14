<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	type Props = { tone: 'error' | 'success'; children: Snippet };
	let { tone, children }: Props = $props();

	const base = 'rounded-row px-4 py-3 font-bold text-ink';
</script>

{#if tone === 'error'}
	<p role="alert" tabindex="-1" class="{base} bg-risk-tile">
		<Icon name="warning" />
		{@render children()}
	</p>
{:else}
	<p role="status" class="{base} bg-earned-tile">
		<Icon name="check-circle" class="text-forest" />
		{@render children()}
	</p>
{/if}
