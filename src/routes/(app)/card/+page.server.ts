import { fail, redirect } from '@sveltejs/kit';
import { daysLeftInMonth, monthName } from '#lib/game/calendar.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { draftFromCard, getDraft, saveDraft } from '#lib/server/card-drafts.ts';
import { currentMonth, getCard, isEditable } from '#lib/server/cards.ts';
import { TEST_CLOCK } from '$app/env/private';
import { cardView } from '#lib/server/card-view.ts';
import { formatEditDeadline, localDate, requestNow } from '#lib/server/clock.ts';
import { requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Your card is not available right now.';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = requireUser(locals);
	// The habit sheet asks for a fresh copy with ?refresh=…; reading it makes SvelteKit rerun this load.
	void url.searchParams.get('refresh');
	const db = requireDb(UNAVAILABLE);
	const timezone = user.timezone ?? 'UTC';
	const now = requestNow(cookies, TEST_CLOCK);
	const month = currentMonth({ timezone }, now);
	const [card, draft] = await Promise.all([
		getCard(db, user.id, month),
		getDraft(db, user.id, month)
	]);

	if (!card) {
		return {
			monthName: monthName(month),
			daysLeft: 0,
			card: null,
			hasDraft: draft.size !== null,
			editable: false,
			deadline: null
		};
	}
	const editable = isEditable(card, now);
	const today = localDate(now, timezone);
	const { squares, score, nextMonthName: next } = await cardView(db, user.id, card, today);
	return {
		monthName: monthName(month),
		daysLeft: daysLeftInMonth(today),
		nextMonthName: next,
		card: {
			size: card.size,
			rewards: card.rewards,
			squares,
			score
		},
		hasDraft: false,
		editable,
		deadline: editable ? formatEditDeadline(card.editableUntil, timezone) : null
	};
};

export const actions: Actions = {
	/** Reopens the builder on the started card, while the 48 hours last. */
	edit: async ({ locals, cookies }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const now = requestNow(cookies, TEST_CLOCK);
		const card = await getCard(
			db,
			user.id,
			currentMonth({ timezone: user.timezone ?? 'UTC' }, now)
		);
		if (!card) redirect(303, '/card/build');
		if (!isEditable(card, now)) return fail(400, { message: 'This card is locked.' });
		await saveDraft(db, user.id, draftFromCard(card));
		redirect(303, '/card/build/habits');
	}
};
