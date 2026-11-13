import type { FlyParams } from 'svelte/transition';

/** Fly-in params that become a plain fade when reduced motion is preferred (spec §4.7). */
export function flyOrFade(y: number, reducedMotion: boolean): FlyParams {
	return { y: reducedMotion ? 0 : y, duration: 200 };
}
