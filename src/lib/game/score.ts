import { addDays, lastDayOf, monthOf } from './calendar.ts';
import { CARD_SIZES, type CardSize } from './card-layout.ts';
import { progressBetween, type CardSpan, type Counts } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';
import type { SquareState } from './square-state.ts';
import { clippedWeeks } from './weeks.ts';

export { counts } from './square-state.ts';

/** Every row, every column, then the two diagonals, as board indexes (spec §3.6). */
export function lineIndexes(size: CardSize): number[][] {
	const range = [...Array(size).keys()];
	return [
		...range.map((row) => range.map((col) => row * size + col)),
		...range.map((col) => range.map((row) => row * size + col)),
		range.map((i) => i * size + i),
		range.map((i) => i * size + (size - 1 - i))
	];
}

/** The lines whose squares all count. */
export function completeLines(counting: boolean[], size: CardSize): number[][] {
	return lineIndexes(size).filter((line) => line.every((index) => counting[index]));
}

export type Tier = 'bingo' | 'sixtyPercent' | 'blackout';

/** The reward tiers reached now; tiers are live and can drop (spec §3.6). */
export function reachedTiers(counting: boolean[], size: CardSize): Tier[] {
	const total = counting.filter(Boolean).length;
	const tiers: Tier[] = [];
	if (completeLines(counting, size).length > 0) tiers.push('bingo');
	if (total >= CARD_SIZES[size].sixtyThreshold) tiers.push('sixtyPercent');
	if (total === counting.length) tiers.push('blackout');
	return tiers;
}

/** Squares still needed for the closest line with no lost square; null when every line is blocked. */
export function squaresToLine(
	size: CardSize,
	states: SquareState[],
	counting: boolean[]
): number | null {
	let best: number | null = null;
	for (const line of lineIndexes(size)) {
		if (line.some((i) => states[i] === 'lost')) continue;
		const need = line.filter((i) => !counting[i] && states[i] !== 'free').length;
		if (best === null || need < best) best = need;
	}
	return best;
}

/** The first reward tier not yet reached. */
export function nextTier(reached: Tier[]): Tier | null {
	return (['bingo', 'sixtyPercent', 'blackout'] as const).find((t) => !reached.includes(t)) ?? null;
}

/**
 * A habit square's points out of 10 (spec §3.7), unrounded. Earn squares and `atLeast` day/week
 * squares score their progress (and keep it when lost); limits of 0 and daily limits score per
 * clean finished day, other limits 10 after the month, unless lost.
 */
export function squarePoints(
	rule: HabitRule,
	span: CardSpan,
	counts: Counts,
	today: string,
	state: SquareState
): number {
	const monthEnd = lastDayOf(monthOf(span.startDate));
	if (rule.direction === 'atMost' && (rule.target === 0 || rule.period === 'day')) {
		// Paid per finished day within the limit; a slip day pays nothing, the rest are kept.
		const limit = rule.period === 'day' ? rule.target : 0;
		const finished = addDays(today, -1) < monthEnd ? addDays(today, -1) : monthEnd;
		let clean = 0;
		let spanDays = 0;
		for (let d = span.startDate; d <= monthEnd; d = addDays(d, 1)) {
			spanDays++;
			if (d <= finished && (counts.get(d) ?? 0) <= limit) clean++;
		}
		return (10 * clean) / spanDays;
	}
	// Other limits are only won once the month is over.
	if (rule.direction === 'atMost') return state !== 'lost' && today > monthEnd ? 10 : 0;
	if (rule.period === 'month') {
		const k = progressBetween(rule, counts, span.startDate, today);
		return (10 * Math.min(k, rule.target)) / rule.target;
	}
	if (rule.period === 'day') {
		let met = 0;
		let spanDays = 0;
		for (let d = span.startDate; d <= monthEnd; d = addDays(d, 1)) {
			spanDays++;
			met += Math.min(counts.get(d) ?? 0, rule.target);
		}
		return (10 * met) / (rule.target * spanDays);
	}
	const weeks = clippedWeeks(rule, span.startDate, span.weekStartsOn);
	const required = weeks.reduce((sum, week) => sum + week.required, 0);
	if (required === 0) return 10;
	const met = weeks.reduce(
		(sum, week) =>
			sum + Math.min(progressBetween(rule, counts, week.start, week.end), week.required),
		0
	);
	return (10 * met) / required;
}

export type CardScore = {
	counting: number;
	percent: number;
	lines: number[][];
	tiers: Tier[];
	points: number;
};

/**
 * The card's totals (spec §3.6–§3.7): +25 per complete line, +100 for blackout, rounded once at
 * the end. `squares` are in board order, the center included.
 */
export function scoreCard(
	size: CardSize,
	squares: { points: number; counting: boolean }[]
): CardScore {
	const counting = squares.map((square) => square.counting);
	const lines = completeLines(counting, size);
	const tiers = reachedTiers(counting, size);
	const base = squares.reduce((sum, square) => sum + square.points, 0);
	const bonus = 25 * lines.length + (tiers.includes('blackout') ? 100 : 0);
	const total = counting.filter(Boolean).length;
	return {
		counting: total,
		// Progress: every habit square's points out of 10, averaged (the center scores nothing).
		percent: Math.round((100 * base) / (10 * CARD_SIZES[size].habits)),
		lines,
		tiers,
		points: Math.round(base + bonus)
	};
}
