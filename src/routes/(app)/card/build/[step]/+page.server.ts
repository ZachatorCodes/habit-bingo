import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import { CATEGORIES, type CategoryId } from '#lib/game/categories.ts';
import { daysLeftInMonth, monthName, nextMonth } from '#lib/game/calendar.ts';
import { canBuildNextMonth } from '#lib/game/next-month.ts';
import {
	CARD_SIZES,
	isCardSize,
	isValidLayout,
	shuffleLayout,
	type CardSize
} from '#lib/game/card-layout.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import {
	STEPS,
	boardPreview,
	canOpen,
	complete,
	firstOpenStep,
	keptSquares,
	nextStep,
	readTargets,
	reopen,
	startDateOf,
	stepsFor,
	targetRows,
	withHabits,
	type Step
} from '#lib/game/card-draft.ts';
import { discardDraft, getDraft, pickedHabits, saveDraft } from '#lib/server/card-drafts.ts';
import { localDate } from '#lib/server/clock.ts';
import {
	currentMonth,
	editBlocked,
	getCard,
	startCard,
	updateCard,
	validateRewards
} from '#lib/server/cards.ts';
import { formText, personOf, readForm, requestClock, requireDb } from '#lib/server/request.ts';
import { DEFAULT_HABIT_INPUT, readHabitForm } from '#lib/server/habit-form.ts';
import { createHabit, listHabits } from '#lib/server/habits.ts';
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

/**
 * The guards a step action runs, in order: the step must be open, the card needs a size, and every
 * picked habit must still be available. Returns the size, kept squares and picked habits.
 */
async function stepGuard(
	{ user, db, card, draft, to }: Awaited<ReturnType<typeof builderContext>>,
	step: Step
) {
	if (!canOpen(draft, step)) redirect(303, to(firstOpenStep(draft)));
	const size: CardSize | null = draft.size ?? card?.size ?? null;
	if (size === null) redirect(303, to('size'));
	const kept = keptSquares(card);
	const picked = await pickedHabits(db, user.id, draft, size, kept);
	if (!picked) redirect(303, to('habits'));
	return { size, kept, picked };
}

/** Today in the person's timezone, for the card's start date. */
const todayOf = (user: { timezone?: string | null }, now: Date) =>
	localDate(now, personOf(user).timezone);

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
		const picked = await pickedHabits(db, user.id, draft, size, kept);
		if (!picked) redirect(303, to('habits'));
		if (params.step === 'targets') {
			const startDate = startDateOf(todayOf(user, now), card, draft);
			targets = {
				startDate,
				daysLeft: daysLeftInMonth(startDate),
				rows: targetRows(picked, draft, startDate, kept)
			};
		}
	}
	let board: { size: CardSize; squares: ReturnType<typeof boardPreview> } | null = null;
	if (params.step === 'board') {
		if (size === null) redirect(303, to('size'));
		const picked = await pickedHabits(db, user.id, draft, size, kept);
		if (!picked) redirect(303, to('habits'));
		let layout = draft.layout;
		if (!layout || !isValidLayout(layout, draft.habitIds, size)) {
			layout = shuffleLayout(draft.habitIds, size, Math.random);
			await saveDraft(db, user.id, { ...draft, layout });
		}
		// A fresh card: every square as it starts. Weeks start Monday here (Finding 1, unfixed).
		const start = startDateOf(todayOf(user, now), card, draft);
		board = { size, squares: boardPreview(picked, layout, start, 'monday') };
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
		const context = await builderContext(locals, cookies, url);
		const { user, db, card, draft, now, to } = context;
		const { kept, picked } = await stepGuard(context, 'targets');
		const startDate = startDateOf(todayOf(user, now), card, draft);

		const form = await request.formData();
		const result = readTargets(picked, (field) => formText(form, field), draft, kept, startDate);
		if (!result.ok)
			return fail(400, { targetErrors: result.targetErrors, targetValues: result.targetValues });

		const next = complete({ ...draft, targets: result.targets }, 'targets');
		await saveDraft(db, user.id, next);
		redirect(303, to(nextStep(next, 'targets')));
	},

	rewards: async ({ locals, cookies, url, request }) => {
		const context = await builderContext(locals, cookies, url);
		const { user, db, draft, to } = context;
		await stepGuard(context, 'rewards');

		const text = await readForm(request);
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
		const context = await builderContext(locals, cookies, url);
		const { user, db, draft } = context;
		const { size } = await stepGuard(context, 'board');
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
