import { addDays, lastDayOf, monthOf } from './calendar.ts';
import { CARD_SIZES, type CardSize } from './card-layout.ts';
import { progressBetween, type CardSpan, type Counts } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';
import type { SquareState } from './square-state.ts';
import { clippedWeeks, weekOf } from './weeks.ts';

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
 * How much of a habit square's whole-month job is done, 0 to 1 (spec: % complete). A lost square
 * counts nothing. Limits fill a share for each finished card day still within the limit.
 */
export function squareCompletion(
	rule: HabitRule,
	span: CardSpan,
	counts: Counts,
	today: string,
	state: SquareState
): number {
	if (state === 'lost') return 0;
	const monthEnd = lastDayOf(monthOf(span.startDate));
	const days: string[] = [];
	for (let d = span.startDate; d <= monthEnd; d = addDays(d, 1)) days.push(d);
	if (rule.direction === 'atMost') {
		const finished = addDays(today, -1) < monthEnd ? addDays(today, -1) : monthEnd;
		const weeks = clippedWeeks(rule, span.startDate, span.weekStartsOn);
		const within = (d: string) => {
			if (rule.target === 0) return (counts.get(d) ?? 0) === 0;
			if (rule.period === 'day') return (counts.get(d) ?? 0) <= rule.target;
			const from = rule.period === 'week' ? weekOf(weeks, d)!.start : span.startDate;
			return progressBetween(rule, counts, from, d) <= rule.target;
		};
		return days.filter((d) => d <= finished && within(d)).length / days.length;
	}
	if (rule.period === 'month') {
		const k = progressBetween(rule, counts, span.startDate, today);
		return Math.min(k, rule.target) / rule.target;
	}
	if (rule.period === 'day') {
		const met = days.reduce((sum, d) => sum + Math.min(counts.get(d) ?? 0, rule.target), 0);
		return met / (rule.target * days.length);
	}
	const weeks = clippedWeeks(rule, span.startDate, span.weekStartsOn);
	const required = weeks.reduce((sum, week) => sum + week.required, 0);
	if (required === 0) return 1;
	const met = weeks.reduce(
		(sum, week) =>
			sum + Math.min(progressBetween(rule, counts, week.start, week.end), week.required),
		0
	);
	return met / required;
}

export type CardScore = {
	counting: number;
	percent: number;
	lines: number[][];
	tiers: Tier[];
};

/**
 * The card's lines, tiers and % complete (every habit square's completion, averaged; the center is
 * left out). `squares` are in board order, the center included.
 */
export function scoreCard(
	size: CardSize,
	squares: { completion: number; counting: boolean }[]
): CardScore {
	const counting = squares.map((square) => square.counting);
	const done = squares.reduce((sum, square) => sum + square.completion, 0);
	return {
		counting: counting.filter(Boolean).length,
		percent: Math.round((100 * done) / CARD_SIZES[size].habits),
		lines: completeLines(counting, size),
		tiers: reachedTiers(counting, size)
	};
}
