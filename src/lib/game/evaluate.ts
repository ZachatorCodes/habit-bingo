import { addDays, lastDayOf, monthOf } from './calendar.ts';
import { BACKFILL_DAYS } from './backfill.ts';
import type { HabitRule } from './habit-rules.ts';
import { counts, type SquareState } from './square-state.ts';
import { clippedWeeks, weekOf, type Week } from './weeks.ts';

/** A square's check-ins: date → count. */
export type Counts = ReadonlyMap<string, number>;

/** What a card contributes to evaluating its squares. */
export type CardSpan = { startDate: string; weekStartsOn: 'monday' | 'sunday' };

/** Progress over the dates in [from, to] by count mode: summed counts, or dates with a check-in. */
export function progressBetween(rule: HabitRule, counts: Counts, from: string, to: string): number {
	let total = 0;
	for (const [date, count] of counts) {
		if (date < from || date > to || count <= 0) continue;
		total += rule.countMode === 'times' ? count : 1;
	}
	return total;
}

/**
 * A square's state for `today` (spec §3.5): earn squares go empty → inProgress → complete; protect
 * squares start held and turn atRisk or lost. `progress` (0–1) is shown for earn squares only.
 * `counting`: whether it counts toward lines and tiers now; only complete monthly goals count
 * before the month is over. Check-ins after `today` or before the card started are ignored.
 */
export function evaluateSquare(
	rule: HabitRule,
	span: CardSpan,
	checkIns: Counts,
	today: string
): { state: SquareState; progress: number; counting: boolean } {
	const monthEnd = lastDayOf(monthOf(span.startDate));
	const end = minDate(today, monthEnd);
	if (rule.direction === 'atLeast' && rule.period === 'month') {
		const k = progressBetween(rule, checkIns, span.startDate, end);
		const state = k === 0 ? 'empty' : k < rule.target ? 'inProgress' : 'complete';
		return { state, progress: Math.min(k, rule.target) / rule.target, counting: counts(state) };
	}
	const state = protectState(rule, span, checkIns, today, end);
	// Only a completed square counts mid-month; the rest count once the month is over.
	return { state, progress: 0, counting: counts(state) && today > monthEnd };
}

function protectState(
	rule: HabitRule,
	span: CardSpan,
	counts: Counts,
	today: string,
	end: string
): SquareState {
	// A day missed more than 3 days ago stops counting; logging it later (any day this month) wins it back.
	const settled = addDays(today, -BACKFILL_DAYS);
	const count = (date: string) => counts.get(date) ?? 0;

	if (rule.period === 'day') {
		const days = datesBetween(span.startDate, end);
		if (rule.direction === 'atMost') {
			if (days.some((d) => count(d) > rule.target)) return 'lost';
			return count(today) === rule.target ? 'atRisk' : 'held';
		}
		const missed = days.filter((d) => d !== today && count(d) < rule.target);
		if (missed.some((d) => d < settled)) return 'lost';
		// Nothing counts until a first day is met.
		if (!days.some((d) => count(d) >= rule.target)) return 'empty';
		return missed.length > 0 ? 'atRisk' : 'held';
	}

	if (rule.period === 'month') {
		// atMost / month (atLeast / month is an earn square).
		const k = progressBetween(rule, counts, span.startDate, end);
		if (k > rule.target) return 'lost';
		return k === rule.target ? 'atRisk' : 'held';
	}

	const weeks = clippedWeeks(rule, span.startDate, span.weekStartsOn).filter(
		(week) => week.start <= today
	);
	const progress = (week: Week) =>
		progressBetween(rule, counts, week.start, minDate(week.end, end));
	if (rule.direction === 'atMost') {
		if (weeks.some((week) => progress(week) > week.required)) return 'lost';
		const current = weekOf(weeks, today);
		return current && progress(current) === current.required ? 'atRisk' : 'held';
	}
	let atRisk = false;
	let met = false;
	for (const week of weeks) {
		// A stub week that requires nothing starts the square only once something is logged in it.
		if (progress(week) >= Math.max(week.required, 1)) met = true;
		const short = week.required - progress(week);
		if (short <= 0) continue;
		if (week.end < today) {
			if (week.end < settled) return 'lost';
			atRisk = true;
		} else if (datesBetween(today, week.end).length <= short) {
			atRisk = true;
		}
	}
	if (!met) return 'empty';
	return atRisk ? 'atRisk' : 'held';
}

function minDate(a: string, b: string): string {
	return a < b ? a : b;
}

/** Every date from `from` to `to`, both included. */
function datesBetween(from: string, to: string): string[] {
	const dates: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
	return dates;
}
