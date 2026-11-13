// The card builder's draft and its step rules. Saving and loading drafts lives in
// lib/server/card-drafts.ts.
import type { CardSize } from './card-layout.ts';
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
