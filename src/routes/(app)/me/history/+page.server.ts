import { error } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import { monthName } from '#lib/game/calendar.ts';
import { middleReward, type CardSize } from '#lib/game/card-layout.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { localDate, requestNow } from '#lib/server/clock.ts';
import { getDb } from '#lib/server/db/client.ts';
import { finalizeMonths, listResults } from '#lib/server/month-results.ts';
import type { PageServerLoad } from './$types';

/** Finished months, newest first (spec §4.11). */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = requireUser(locals);
	const db = getDb();
	if (!db) error(503, 'Your history is not available right now.');
	const today = localDate(requestNow(cookies, TEST_CLOCK), user.timezone ?? 'UTC');
	await finalizeMonths(db, user.id, today);
	const results = await listResults(db, user.id);
	return {
		months: results.map((result) => {
			const labels = {
				bingo: 'Bingo',
				sixtyPercent: `${middleReward(result.size as CardSize, result.month)} squares`,
				blackout: 'Blackout'
			};
			return {
				month: result.month,
				name: `${monthName(result.month)} ${result.month.slice(0, 4)}`,
				tiers: result.tiers.map((tier) => labels[tier])
			};
		})
	};
};
