// The card builder's draft and its step rules. Saving and loading drafts lives in
// lib/server/card-drafts.ts.
import type { IconName } from '#lib/icons.ts';
import { monthOf } from './calendar.ts';
import type { CardSize } from './card-layout.ts';
import { evaluateSquare } from './evaluate.ts';
import { targetRange, type HabitRule } from './habit-rules.ts';
import { prorateTarget } from './proration.ts';
import type { SquareState } from './square-state.ts';
import type { Rewards } from './types.ts';

export const STEPS = ['size', 'habits', 'targets', 'rewards', 'board'] as const;
export type Step = (typeof STEPS)[number];

export type CardDraft = {
	month: string;
	/** Set when changing this month's existing card instead of building a new one. */
	cardId: string | null;
	size: CardSize | null;
	habitIds: string[];
	/** Target overrides by habit id; a missing habit gets its prorated target. */
	targets: Record<string, number>;
	rewards: Rewards;
	/** Habit ids by board position, null at the FREE square. */
	layout: (string | null)[] | null;
	completed: Step[];
};

export function emptyDraft(month: string): CardDraft {
	return {
		month,
		cardId: null,
		size: null,
		habitIds: [],
		targets: {},
		rewards: { bingo: '', sixty: '', blackout: '' },
		layout: null,
		completed: []
	};
}

/** The builder's steps in order; changing an existing card keeps its size, so there is no size step. */
export function stepsFor(draft: CardDraft): Step[] {
	return draft.cardId ? STEPS.filter((step) => step !== 'size') : [...STEPS];
}

/** The first step not yet completed, or the last one when everything is. */
export function firstOpenStep(draft: CardDraft): Step {
	return stepsFor(draft).find((step) => !draft.completed.includes(step)) ?? 'board';
}

/** A step opens once every step before it is completed. */
export function canOpen(draft: CardDraft, step: Step): boolean {
	const steps = stepsFor(draft);
	const index = steps.indexOf(step);
	return index !== -1 && steps.slice(0, index).every((s) => draft.completed.includes(s));
}

/** Sets the habits; overrides of removed habits go, and the layout goes when the set changed. */
export function withHabits(draft: CardDraft, habitIds: string[]): CardDraft {
	const kept = new Set(habitIds);
	const before = new Set(draft.habitIds);
	const changed = kept.size !== before.size || habitIds.some((id) => !before.has(id));
	return {
		...draft,
		habitIds,
		targets: Object.fromEntries(Object.entries(draft.targets).filter(([id]) => kept.has(id))),
		layout: changed ? null : draft.layout
	};
}

/** The draft with the given step marked done. */
export function complete(draft: CardDraft, step: Step): CardDraft {
	const done = new Set([...draft.completed, step]);
	return { ...draft, completed: stepsFor(draft).filter((s) => done.has(s)) };
}

/** The draft with the given step and every later one open again, because something upstream changed. */
export function reopen(draft: CardDraft, step: Step): CardDraft {
	const before = stepsFor(draft).slice(0, stepsFor(draft).indexOf(step));
	return { ...draft, completed: before.filter((s) => draft.completed.includes(s)) };
}

export function nextStep(draft: CardDraft, step: Step): Step {
	const steps = stepsFor(draft);
	return steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)];
}

/** What the builder needs of a habit: its icon, name and rule. */
export type PickedHabit = { id: string; icon: IconName; name: string } & HabitRule;

/** A square of the card being edited, as far as the builder reads it. */
type EditedSquare =
	| { isCenter: true }
	| ({ isCenter: false; habitId: string | null; icon: IconName; name: string } & HabitRule);

/** The day the card starts: the existing card's when changing it, otherwise today. */
export function startDateOf(
	today: string,
	card: { id: string; startDate: string } | null,
	draft: CardDraft
): string {
	if (card && draft.cardId === card.id) return card.startDate;
	// Next month's card starts on the 1st.
	return draft.month === monthOf(today) ? today : `${draft.month}-01`;
}

/** The squares of the card being edited, by habit id; nothing when building a new card. */
export function keptSquares(card: { squares: readonly EditedSquare[] } | null) {
	const kept = new Map<string, PickedHabit>();
	for (const square of card?.squares ?? []) {
		if (square.isCenter || !square.habitId) continue;
		// A habit already on the card stays as snapshotted, even if the library has changed since.
		kept.set(square.habitId, { ...square, id: square.habitId });
	}
	return kept;
}

/** The target a habit starts at: the card's own for a habit already on it, otherwise prorated. */
export function startingTarget(
	habit: PickedHabit,
	kept: ReadonlyMap<string, PickedHabit>,
	startDate: string
): number {
	return kept.has(habit.id) ? habit.target : prorateTarget(habit, startDate);
}

/** One row per picked habit: its starting target and the value to show (override or starting). */
export function targetRows<H extends PickedHabit>(
	picked: H[],
	draft: CardDraft,
	startDate: string,
	kept: ReadonlyMap<string, PickedHabit>
) {
	return picked.map((habit) => {
		const prorated = startingTarget(habit, kept, startDate);
		return {
			habit,
			prorated,
			value: draft.targets[habit.id] ?? prorated,
			range: targetRange(habit.direction, habit.period, habit.countMode)
		};
	});
}

/**
 * The Targets step's typed values: every field checked against its range. Building a card keeps
 * only targets that differ from the starting one; changing a card keeps every typed target, since a
 * stored target stays unless told otherwise.
 */
export function readTargets(
	picked: PickedHabit[],
	text: (field: string) => string,
	draft: CardDraft,
	kept: ReadonlyMap<string, PickedHabit>,
	startDate: string
):
	| { ok: true; targets: Record<string, number> }
	| { ok: false; targetErrors: Record<string, string>; targetValues: Record<string, string> } {
	const values: Record<string, string> = {};
	const errors: Record<string, string> = {};
	const targets: Record<string, number> = {};
	for (const habit of picked) {
		const field = `target:${habit.id}`;
		const typed = text(field).trim();
		values[field] = typed;
		const { min, max } = targetRange(habit.direction, habit.period, habit.countMode);
		const number = Number(typed);
		if (!/^\d+$/.test(typed) || number < min || number > max) {
			errors[field] = `Pick a number from ${min} to ${max}.`;
		} else if (draft.cardId || number !== startingTarget(habit, kept, startDate)) {
			targets[habit.id] = number;
		}
	}
	if (Object.keys(errors).length > 0)
		return { ok: false, targetErrors: errors, targetValues: values };
	return { ok: true, targets };
}

/** The Board step's preview: every square as it starts (no check-ins yet), FREE in the middle. */
export function boardPreview(
	picked: PickedHabit[],
	layout: (string | null)[],
	startDate: string,
	weekStartsOn: 'monday' | 'sunday'
): { icon: string; name: string; state: SquareState }[] {
	const byId = new Map(picked.map((h) => [h.id, h]));
	const span = { startDate, weekStartsOn };
	return layout.map((id) => {
		const habit = id === null ? null : byId.get(id)!;
		return habit
			? {
					icon: habit.icon,
					name: habit.name,
					state: evaluateSquare(habit, span, new Map(), startDate).state
				}
			: { icon: 'star', name: 'Free', state: 'free' as const };
	});
}
