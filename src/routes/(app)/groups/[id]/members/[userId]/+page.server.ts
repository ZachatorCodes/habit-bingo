import { error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';

import { requestClock, requireDb } from '#lib/server/request.ts';
import { memberCard } from '#lib/server/leaderboard.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const user = requireUser(locals);
	const db = requireDb('Groups are not available right now.');
	const result = await memberCard(db, user.id, params.id, params.userId, requestClock(cookies));
	if (!result) error(404, 'Not found');
	return { groupId: params.id, userId: params.userId, ...result };
};
