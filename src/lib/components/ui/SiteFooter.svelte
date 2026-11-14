<script lang="ts">
	import Icon from './Icon.svelte';
	import { resolve } from '$app/paths';
</script>

<footer class="mt-16 border-t-2 border-line px-4 py-8 text-sm text-muted">
	<nav class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
		<span class="inline-flex items-center gap-1 font-extrabold text-ink"
			><Icon name="target" /> Habit Bingo</span
		>
		<div class="flex gap-5">
			<a
				class="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
				href={resolve('/privacy')}>Privacy</a
			>
			<a
				class="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
				href={resolve('/terms')}>Terms</a
			>
		</div>
	</nav>
</footer>
