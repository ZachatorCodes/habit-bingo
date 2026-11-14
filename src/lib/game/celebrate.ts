import type { CardScore, Tier } from '#lib/game/score.ts';

/**
 * Lines and reward tiers complete in `after` that weren't in `before` — what a log just achieved.
 * Drops (a lost square) give nothing: only gains are celebrated (spec §4.7).
 */
export function newlyCompleted(
	before: CardScore,
	after: CardScore
): { lines: number[][]; tiers: Tier[] } {
	const had = new Set(before.lines.map((line) => line.join(',')));
	return {
		lines: after.lines.filter((line) => !had.has(line.join(','))),
		tiers: after.tiers.filter((tier) => !before.tiers.includes(tier))
	};
}
