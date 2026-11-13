<script lang="ts">
	import Icon from './Icon.svelte';

	type Props = {
		icon: string;
		variant: 'open' | 'progress' | 'earned' | 'protected' | 'risk' | 'lost';
		percent?: number;
		size?: 'sm' | 'md' | 'lg';
	};
	let { icon, variant, percent = 0, size = 'md' }: Props = $props();

	const PX = { sm: 32, md: 42, lg: 56 } as const;
	const px = $derived(PX[size]);
	const stroke = $derived(size === 'sm' ? 3 : 3.5);
	const r = $derived((px - stroke) / 2);
	const circ = $derived(2 * Math.PI * r);
	const pct = $derived(Math.min(100, Math.max(0, percent)));

	const STROKE: Record<string, string> = {
		progress: 'var(--color-forest)',
		earned: 'var(--color-forest)',
		protected: 'var(--color-protected-ring)',
		risk: 'var(--color-terracotta)',
		lost: 'var(--color-lost-ring)'
	};
	const dash = $derived(
		variant === 'risk' ? '6 5' : `${variant === 'progress' ? (circ * pct) / 100 : circ} ${circ}`
	);
</script>

<span
	aria-hidden="true"
	data-variant={variant}
	class="relative inline-flex shrink-0 items-center justify-center text-forest"
	style:width="{px}px"
	style:height="{px}px"
>
	<svg width={px} height={px} viewBox="0 0 {px} {px}" class="absolute inset-0 -rotate-90">
		<circle
			cx={px / 2}
			cy={px / 2}
			{r}
			fill="none"
			stroke="var(--color-line)"
			stroke-width={stroke}
		/>
		{#if variant !== 'open'}
			<circle
				data-arc
				data-percent={variant === 'progress' ? pct : undefined}
				cx={px / 2}
				cy={px / 2}
				{r}
				fill="none"
				stroke={STROKE[variant]}
				stroke-width={stroke}
				stroke-linecap={variant === 'risk' ? 'butt' : 'round'}
				stroke-dasharray={dash}
				class="transition-[stroke-dasharray] duration-400 ease-out motion-reduce:transition-none"
			/>
		{/if}
	</svg>
	<Icon name={icon} size={px * 0.5} />
</span>
