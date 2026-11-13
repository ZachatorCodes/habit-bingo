import { requireUser } from '#lib/server/auth/guards.ts';
import { requireDb } from '#lib/server/request.ts';
import { listGroups } from '#lib/server/groups.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = requireDb('Groups are not available right now.');
	return { groups: await listGroups(db, user.id) };
};
