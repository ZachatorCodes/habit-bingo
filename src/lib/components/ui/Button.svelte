<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = {
		variant?: 'primary' | 'secondary';
		href?: string;
		type?: 'button' | 'submit';
		children: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'type' | 'children'>;

	let {
		variant = 'primary',
		href,
		type = 'button',
		children,
		class: className,
		...rest
	}: Props = $props();

	const styles = {
		primary: 'bg-forest text-white border-forest',
		secondary: 'bg-surface text-ink border-line'
	};
	const base =
		'inline-flex items-center justify-center gap-2 min-h-11 rounded-full border px-5 py-2.5 font-extrabold transition-transform motion-safe:active:scale-[0.97] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';
</script>

{#if href}
	<!-- Callers pass an already-resolved href (e.g. resolve('/signin')). -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} class={[base, styles[variant], className]} {...rest}>{@render children()}</a>
{:else}
	<button {type} class={[base, styles[variant], className]} {...rest}>{@render children()}</button>
{/if}
