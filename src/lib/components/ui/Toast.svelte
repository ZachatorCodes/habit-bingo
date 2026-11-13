<script lang="ts">
	import Icon from './Icon.svelte';
	type Props = {
		/** A new `id` shows the message (again, even with the same text); it hides after `duration` ms. */
		message: { id: number; text: string } | null;
		duration?: number;
	};

	let { message, duration = 4000 }: Props = $props();

	let shown = $state<{ id: number; text: string } | null>(null);

	$effect(() => {
		shown = message;
		if (!message) return;
		const timer = setTimeout(() => (shown = null), duration);
		return () => clearTimeout(timer);
	});
</script>

<!-- One live region for the page's life, so screen readers announce each message as it arrives. -->
<div
	role="status"
	class="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--tab-bar,var(--safe-bottom,0px)))] z-50 flex justify-center px-4 md:left-[calc(var(--sidebar,0px)+1rem)]"
>
	{#if shown}
		{#key shown.id}
			<p
				class="pointer-events-auto rounded-2xl border border-line bg-surface px-4 py-3 font-bold text-ink shadow-sheet"
			>
				<Icon name="warning" />
				{shown.text}
			</p>
		{/key}
	{/if}
</div>
