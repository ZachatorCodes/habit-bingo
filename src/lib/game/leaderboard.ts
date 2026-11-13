/**
 * Group leaderboard order: % complete descending, then more complete lines, then display name A–Z,
 * with competition ranks (1, 1, 3) over equal % and lines. People with no card (`percent: null`)
 * come last, unranked, in input order.
 */
export function rankRows<
	T extends { percent: number | null; lines: number | null; displayUsername: string }
>(rows: T[]): (T & { rank: number | null })[] {
	const scored = rows
		.filter((r) => r.percent !== null)
		.sort(
			(a, b) =>
				b.percent! - a.percent! ||
				b.lines! - a.lines! ||
				a.displayUsername.localeCompare(b.displayUsername)
		);
	const ranked = scored.map((r) => ({
		...r,
		rank: scored.findIndex((s) => s.percent === r.percent && s.lines === r.lines) + 1
	}));
	return [...ranked, ...rows.filter((r) => r.percent === null).map((r) => ({ ...r, rank: null }))];
}
