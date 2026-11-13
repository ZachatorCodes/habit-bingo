import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import { CATEGORIES, type CategoryId } from '#lib/game/categories.ts';
import { daysLeftInMonth, monthName, monthOf, nextMonth } from '#lib/game/calendar.ts';
import { canBuildNextMonth } from '#lib/game/next-month.ts';
import {
	CARD_SIZES,
	isCardSize,
	isValidLayout,
	shuffleLayout,
	type CardSize
} from '#lib/game/card-layout.ts';
import { evaluateSquare } from '#lib/game/evaluate.ts';
import { targetRange } from '#lib/game/habit-rules.ts';
import { prorateTarget } from '#lib/game/proration.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import {
	STEPS,
	canOpen,
	discardDraft,
	firstOpenStep,
	getDraft,
	saveDraft,
	stepsFor,
	withHabits,
	type CardDraft,
	type Step
} from '#lib/server/card-drafts.ts';
import { localDate } from '#lib/server/clock.ts';
import {
	currentMonth,
	editBlocked,
	getCard,
	startCard,
	updateCard,
	validateRewards,
	type Card
} from '#lib/server/cards.ts';
import type { Db } from '#lib/server/db/client.ts';
import { personOf, requestClock, requireDb } from '#lib/server/request.ts';
import { DEFAULT_HABIT_INPUT, readHabitForm } from '#lib/server/habit-form.ts';
import { createHabit, listHabits, type Habit } from '#lib/server/habits.ts';
import type { SquareState } from '#lib/game/square-state.ts';
import type { Actions, PageServerLoad } from './$types';

function isStep(value: string): value is Step {
	return (STEPS as readonly string[]).includes(value);
}

/**
 * The person, their database and the draft for the card being built — this month's, or next
 * month's with `?for=next` (only in this month's last 7 days) — or a redirect when a card already
 * exists. `to(step)` is a builder URL that keeps `for=next`.
 */
async function builderContext(locals: App.Locals, cookies: Cookies, url: URL) {
	const user = requireUser(locals);
	const db = requireDb('The card builder is not available right now.');
	const now = requestClock(cookies);
	const current = currentMonth({ timezone: personOf(user).timezone }, now);
	const forNext = url.searchParams.get('for') === 'next';
	if (forNext && !canBuildNextMonth(localDate(now, personOf(user).timezone)))
		redirect(303, '/card');
	const month = forNext ? nextMonth(current) : current;
	const to = (step?: Step, extra?: string) => {
		const query = [forNext && 'for=next', extra].filter(Boolean).join('&');
		return `/card/build${step ? `/${step}` : ''}${query ? `?${query}` : ''}`;
	};
	const [card, draft] = await Promise.all([
		getCard(db, user.id, month),
		getDraft(db, user.id, month, current)
	]);
	// An edit draft outlives its window: drop it rather than let people redo steps that cannot save.
	if (editBlocked(draft.cardId, card, now)) {
		await discardDraft(db, user.id, draft.month);
		redirect(303, '/card?locked=1');
	}
	// A card for this month can only be changed through a draft that is editing it.
	if (card && draft.cardId !== card.id) redirect(303, '/card');
	return { user, db, month, card, draft, now, forNext, to };
}

/** The draft with the given step marked done. */
function complete(draft: CardDraft, step: Step): CardDraft {
	const done = new Set([...draft.completed, step]);
	return { ...draft, completed: stepsFor(draft).filter((s) => done.has(s)) };
}

/** The draft with the given step and every later one open again, because something upstream changed. */
function reopen(draft: CardDraft, step: Step): CardDraft {
	const before = stepsFor(draft).slice(0, stepsFor(draft).indexOf(step));
	return { ...draft, completed: before.filter((s) => draft.completed.includes(s)) };
}

function nextStep(draft: CardDraft, step: Step): Step {
	const steps = stepsFor(draft);
	return steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)];
}

/** The day the card starts: the existing card's when changing it, otherwise today. */
function startDateOf(
	user: { timezone?: string | null },
	card: Card | null,
	draft: CardDraft,
	now: Date
) {
	if (card && draft.cardId === card.id) return card.startDate;
	const today = localDate(now, personOf(user).timezone);
	// Next month's card starts on the 1st.
	return draft.month === monthOf(today) ? today : `${draft.month}-01`;
}

/** What the builder needs of a habit: its icon, name and rule. */
type PickedHabit = Pick<
	Habit,
	'id' | 'icon' | 'name' | 'direction' | 'period' | 'countMode' | 'target'
>;

/** The squares of the card being edited, by habit id; nothing when building a new card. */
function keptSquares(card: Card | null) {
	const kept = new Map<string, PickedHabit>();
	for (const square of card?.squares ?? []) {
		if (square.isCenter || !square.habitId) continue;
		// A habit already on the card stays as snapshotted, even if the library has changed since.
		kept.set(square.habitId, { ...square, id: square.habitId });
	}
	return kept;
}

/**
 * The picked habits that can go on the card, in pick order: active habits, and habits already on
 * the card being edited (which stay as they are even when archived since). A habit archived after
 * it was picked leaves the set short, so the person is sent back to re-pick.
 */
async function pickedHabits(
	db: Db,
	userId: string,
	draft: CardDraft,
	size: CardSize,
	kept: ReadonlyMap<string, PickedHabit>,
	habitsUrl: string
): Promise<PickedHabit[]> {
	const active = new Map((await listHabits(db, userId)).map((h) => [h.id, h]));
	const picked = draft.habitIds.flatMap((id) => kept.get(id) ?? active.get(id) ?? []);
	if (picked.length !== CARD_SIZES[size].habits) redirect(303, habitsUrl);
	return picked;
}

/** The target a habit starts at: the card's own for a habit already on it, otherwise prorated. */
function startingTarget(
	habit: PickedHabit,
	kept: ReadonlyMap<string, PickedHabit>,
	startDate: string
) {
	return kept.has(habit.id) ? habit.target : prorateTarget(habit, startDate);
}

/** One row per picked habit: its starting target and the value to show (override or starting). */
function targetRows(
	picked: PickedHabit[],
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

export const load: PageServerLoad = async ({ locals, cookies, params, url }) => {
	if (!isStep(params.step)) error(404, 'Not found');
	const { user, db, month, card, draft, now, to, forNext } = await builderContext(
		locals,
		cookies,
		url
	);
	// Changing a card keeps its size, so its builder starts at the habits.
	if (params.step === 'size' && draft.cardId) redirect(303, to('habits'));
	if (!canOpen(draft, params.step)) redirect(303, to(firstOpenStep(draft)));

	const size: CardSize | null = draft.size ?? card?.size ?? null;
	const kept = keptSquares(card);
	const habits = await listHabits(db, user.id);
	const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<CategoryId, number>;
	for (const habit of habits) counts[habit.category] += 1;
	let targets: { startDate: string; daysLeft: number; rows: ReturnType<typeof targetRows> } | null =
		null;
	if (params.step === 'targets' || params.step === 'rewards') {
		if (size === null) redirect(303, to('size'));
		const picked = await pickedHabits(db, user.id, draft, size, kept, to('habits'));
		if (params.step === 'targets') {
			const startDate = startDateOf(user, card, draft, now);
			targets = {
				startDate,
				daysLeft: daysLeftInMonth(startDate),
				rows: targetRows(picked, draft, startDate, kept)
			};
		}
	}
	let board: {
		size: CardSize;
		squares: { icon: string; name: string; state: SquareState }[];
	} | null = null;
	if (params.step === 'board') {
		if (size === null) redirect(303, to('size'));
		const picked = await pickedHabits(db, user.id, draft, size, kept, to('habits'));
		let layout = draft.layout;
		if (!layout || !isValidLayout(layout, draft.habitIds, size)) {
			layout = shuffleLayout(draft.habitIds, size, Math.random);
			await saveDraft(db, user.id, { ...draft, layout });
		}
		const byId = new Map(picked.map((h) => [h.id, h]));
		// A fresh card: every square as it starts (no check-ins yet).
		const start = startDateOf(user, card, draft, now);
		const preview = { startDate: start, weekStartsOn: 'monday' as const };
		board = {
			size,
			squares: layout.map((id) => {
				const habit = id === null ? null : byId.get(id)!;
				return habit
					? {
							icon: habit.icon,
							name: habit.name,
							state: evaluateSquare(habit, preview, new Map(), start).state
						}
					: { icon: 'star', name: 'Free', state: 'free' as const };
			})
		};
	}
	return {
		step: params.step,
		board,
		notice:
			url.searchParams.get('notice') === 'habits'
				? 'One of your habits is no longer available. Pick your habits again.'
				: null,
		steps: stepsFor(draft),
		draft,
		targets,
		sixtyThreshold: size === null ? null : CARD_SIZES[size].sixtyThreshold,
		monthName: monthName(month),
		/** Building next month's card (?for=next): the page heading and form actions keep it. */
		forNext,
		keep: forNext ? '&for=next' : '',
		habits,
		counts,
		/** How many habits the card holds; null until a size is picked. */
		need: size === null ? null : CARD_SIZES[size].habits,
		values: DEFAULT_HABIT_INPUT
	};
};

export const actions: Actions = {
	size: async ({ locals, cookies, url, request }) => {
		const { user, db, draft, to } = await builderContext(locals, cookies, url);
		if (draft.cardId) redirect(303, to(firstOpenStep(draft)));
		const raw = Number((await request.formData()).get('size'));
		if (!isCardSize(raw)) return fail(400, { message: 'Pick a size.' });

		// A new size needs a new number of habits, so everything after it is open again.
		const changed = draft.size !== raw;
		const sized = { ...draft, size: raw, layout: changed ? null : draft.layout };
		const next = complete(changed ? reopen(sized, 'size') : sized, 'size');
		await saveDraft(db, user.id, next);
		redirect(303, to(nextStep(next, 'size')));
	},

	habits: async ({ locals, cookies, url, request }) => {
		const { user, db, card, draft, to } = await builderContext(locals, cookies, url);
		if (!canOpen(draft, 'habits')) redirect(303, to(firstOpenStep(draft)));
		const size: CardSize | null = draft.size ?? card?.size ?? null;
		if (size === null) redirect(303, to('size'));

		const ids = (await request.formData())
			.getAll('habitIds')
			.filter((id): id is string => typeof id === 'string');
		const need = CARD_SIZES[size].habits;
		if (ids.length !== need || new Set(ids).size !== need) {
			return fail(400, { message: `Pick exactly ${need} habits.`, selected: ids });
		}
		const mine = new Set((await listHabits(db, user.id)).map((h) => h.id));
		if (ids.some((id) => !mine.has(id))) {
			return fail(400, { message: 'Pick from your habits.', selected: ids });
		}

		const before = new Set(draft.habitIds);
		const same = before.size === need && ids.every((id) => before.has(id));
		const picked = withHabits(draft, ids);
		const next = complete(same ? picked : reopen(picked, 'habits'), 'habits');
		await saveDraft(db, user.id, next);
		redirect(303, to(nextStep(next, 'habits')));
	},

	targets: async ({ locals, cookies, url, request }) => {
		const { user, db, card, draft, now, to } = await builderContext(locals, cookies, url);
		if (!canOpen(draft, 'targets')) redirect(303, to(firstOpenStep(draft)));
		const size: CardSize | null = draft.size ?? card?.size ?? null;
		if (size === null) redirect(303, to('size'));
		const kept = keptSquares(card);
		const picked = await pickedHabits(db, user.id, draft, size, kept, to('habits'));
		const startDate = startDateOf(user, card, draft, now);

		const form = await request.formData();
		const values: Record<string, string> = {};
		const errors: Record<string, string> = {};
		const targets: Record<string, number> = {};
		for (const habit of picked) {
			const field = `target:${habit.id}`;
			const raw = form.get(field);
			const text = typeof raw === 'string' ? raw.trim() : '';
			values[field] = text;
			const { min, max } = targetRange(habit.direction, habit.period, habit.countMode);
			const number = Number(text);
			if (!/^\d+$/.test(text) || number < min || number > max) {
				errors[field] = `Pick a number from ${min} to ${max}.`;
			} else if (draft.cardId || number !== startingTarget(habit, kept, startDate)) {
				// Changing a card keeps every typed target: a stored target stays unless told otherwise.
				targets[habit.id] = number;
			}
		}
		if (Object.keys(errors).length > 0)
			return fail(400, { targetErrors: errors, targetValues: values });

		const next = complete({ ...draft, targets }, 'targets');
		await saveDraft(db, user.id, next);
		redirect(303, to(nextStep(next, 'targets')));
	},

	rewards: async ({ locals, cookies, url, request }) => {
		const { user, db, card, draft, to } = await builderContext(locals, cookies, url);
		if (!canOpen(draft, 'rewards')) redirect(303, to(firstOpenStep(draft)));
		const size: CardSize | null = draft.size ?? card?.size ?? null;
		if (size === null) redirect(303, to('size'));
		await pickedHabits(db, user.id, draft, size, keptSquares(card), to('habits'));

		const form = await request.formData();
		const text = (name: string) => {
			const raw = form.get(name);
			return typeof raw === 'string' ? raw : '';
		};
		const typed = { bingo: text('bingo'), sixty: text('sixty'), blackout: text('blackout') };
		const result = validateRewards(typed);
		if (!result.ok) {
			return fail(400, { errors: { [result.field]: result.message }, rewardValues: typed });
		}

		const next = complete({ ...draft, rewards: result.value }, 'rewards');
		await saveDraft(db, user.id, next);
		redirect(303, to(nextStep(next, 'rewards')));
	},

	shuffle: async ({ locals, cookies, url }) => {
		const { user, db, card, draft, to } = await builderContext(locals, cookies, url);
		if (!canOpen(draft, 'board')) redirect(303, to(firstOpenStep(draft)));
		const size: CardSize | null = draft.size ?? card?.size ?? null;
		if (size === null) redirect(303, to('size'));
		await pickedHabits(db, user.id, draft, size, keptSquares(card), to('habits'));
		await saveDraft(db, user.id, {
			...draft,
			layout: shuffleLayout(draft.habitIds, size, Math.random)
		});
	},

	start: async ({ locals, cookies, url }) => {
		const { user, db, draft, now, to, forNext } = await builderContext(locals, cookies, url);
		if (!canOpen(draft, 'board')) redirect(303, to(firstOpenStep(draft)));
		if (draft.size === null) redirect(303, to('size'));
		// Opening the Board step makes the layout; without one the person has not seen a board yet.
		if (!draft.layout) redirect(303, to('board'));

		const person = {
			id: user.id,
			...personOf(user)
		};
		const plan = {
			habitIds: draft.habitIds,
			targets: draft.targets,
			rewards: draft.rewards,
			layout: draft.layout
		};
		const editing = draft.cardId !== null;
		const result =
			draft.cardId !== null
				? await updateCard(db, person, draft.cardId, plan, now)
				: await startCard(db, person, { size: draft.size, month: draft.month, ...plan }, now);
		if (result.ok) {
			await discardDraft(db, user.id, draft.month);
			redirect(303, editing ? '/card?saved=1' : forNext ? '/card?planned=1' : '/card?started=1');
		}
		if (result.field === 'locked') {
			await discardDraft(db, user.id, draft.month);
			redirect(303, '/card?locked=1');
		}
		if (result.field === 'exists') redirect(303, '/card');
		if (result.field === 'habits') redirect(303, to('habits', 'notice=habits'));
		return fail(400, { message: result.message });
	},

	createHabit: async ({ locals, cookies, url, request }) => {
		const { user, db, draft } = await builderContext(locals, cookies, url);
		const values = await readHabitForm(request);
		const result = await createHabit(db, user.id, values);
		if (!result.ok) {
			return fail(400, { values, errors: { [result.field]: result.message } });
		}
		// The new habit joins the selection; the person may now have more picked than the card holds,
		// which the Habits step explains when they continue.
		const next = reopen(withHabits(draft, [...draft.habitIds, result.habit.id]), 'habits');
		await saveDraft(db, user.id, next);
		return { createdHabitId: result.habit.id };
	},

	discard: async ({ locals, cookies, url }) => {
		const { user, db, draft, to } = await builderContext(locals, cookies, url);
		await discardDraft(db, user.id, draft.month);
		redirect(303, draft.cardId ? '/card' : to());
	}
};
