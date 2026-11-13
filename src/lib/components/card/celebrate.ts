// Pop & burst (spec §4.7): a small confetti burst and a haptic tap when a habit is logged.
import type { Options } from 'canvas-confetti';

/** The Garden palette: forest, leaf, sage tint, terracotta, sky. */
export const CONFETTI_COLORS = ['#2F5D46', '#4E7E62', '#E3ECDD', '#D9693F', '#5B8AA6'];

type Fire = (options: Options) => unknown;

/**
 * A small confetti burst from `origin` (0–1 of the viewport), or nothing under reduced motion.
 * canvas-confetti is loaded on first use, so it never runs on the server.
 */
export async function burst(
	origin: { x: number; y: number },
	reducedMotion: boolean,
	fire?: Fire
): Promise<void> {
	if (reducedMotion) return;
	const confetti = fire ?? (await import('canvas-confetti')).default;
	confetti({
		origin,
		colors: CONFETTI_COLORS,
		particleCount: 24,
		spread: 70,
		startVelocity: 24,
		ticks: 90,
		scalar: 0.8,
		disableForReducedMotion: true
	});
}

/** A short haptic tap where the browser supports it (Android; iOS Safari has no web haptics). */
export function tap(): void {
	globalThis.navigator?.vibrate?.(10);
}

/** Full-screen confetti for a completed line (spec §4.7); nothing under reduced motion. */
export async function fullScreenConfetti(reducedMotion: boolean, fire?: Fire): Promise<void> {
	if (reducedMotion) return;
	const confetti = fire ?? (await import('canvas-confetti')).default;
	for (const x of [0.2, 0.5, 0.8]) {
		confetti({
			origin: { x, y: 0.3 },
			colors: CONFETTI_COLORS,
			particleCount: 80,
			spread: 100,
			startVelocity: 40,
			ticks: 200,
			disableForReducedMotion: true
		});
	}
}
