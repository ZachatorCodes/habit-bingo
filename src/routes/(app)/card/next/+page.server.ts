import { redirect } from '@sveltejs/kit';
import { nextMonth } from '#lib/game/calendar.ts';
import { canBuildNextMonth } from '#lib/game/next-month.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { draftFromCard, getDraft, saveDraft } from '#lib/server/card-drafts.ts';
import { currentMonth, getCard, isEditable } from '#lib/server/cards.ts';
import { localDate } from '#lib/server/clock.ts';
import { personOf, requestClock, requireDb } from '#lib/server/request.ts';
import type { PageServerLoad } from './$types';

/**
 * Where the center square leads (spec §3.5): the builder for next month's card, or that card in
 * the editor once it is built. Only open in the last 7 days of the month.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = requireUser(locals);
	const db = requireDb('The card builder is not available right now.');
	const timezone = personOf(user).timezone;
	const now = requestClock(cookies);
	if (!canBuildNextMonth(localDate(now, timezone))) redirect(303, '/card');
	const current = currentMonth({ timezone }, now);
	const month = nextMonth(current);
	const card = await getCard(db, user.id, month);
	if (!card) redirect(303, '/card/build?for=next');
	if (!isEditable(card, now)) redirect(303, '/card');
	// Keep an edit already in progress; otherwise start editing from the card as it is.
	const draft = await getDraft(db, user.id, month, current);
	if (draft.cardId !== card.id) await saveDraft(db, user.id, draftFromCard(card));
	redirect(303, '/card/build/habits?for=next');
};
