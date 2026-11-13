import { redirect } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import { nextMonth } from '#lib/game/calendar.ts';
import { canBuildNextMonth } from '#lib/game/next-month.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { currentMonth, getCard } from '#lib/server/cards.ts';
import { firstOpenStep, getDraft } from '#lib/server/card-drafts.ts';
import { localDate, requestNow } from '#lib/server/clock.ts';
import { requireDb } from '#lib/server/request.ts';
import type { PageServerLoad } from './$types';

/** Sends the person to the first unfinished step, for this month's card or (`?for=next`) next month's. */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = requireUser(locals);
	const db = requireDb('The card builder is not available right now.');
	const timezone = user.timezone ?? 'UTC';
	const now = requestNow(cookies, TEST_CLOCK);
	const current = currentMonth({ timezone }, now);
	const forNext = url.searchParams.get('for') === 'next';
	if (forNext && !canBuildNextMonth(localDate(now, timezone))) redirect(303, '/card');
	const month = forNext ? nextMonth(current) : current;
	const [card, draft] = await Promise.all([
		getCard(db, user.id, month),
		getDraft(db, user.id, month, current)
	]);
	if (card && draft.cardId !== card.id) redirect(303, forNext ? '/card/next' : '/card');
	redirect(303, `/card/build/${firstOpenStep(draft)}${forNext ? '?for=next' : ''}`);
};
