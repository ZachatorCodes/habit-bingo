import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';

import { requestClock, requireDb } from '#lib/server/request.ts';
import { createGroup } from '#lib/server/groups.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireUser(locals);
};

export const actions: Actions = {
	default: async ({ locals, request, cookies }) => {
		const user = requireUser(locals);
		const db = requireDb('Groups are not available right now.');
		const formData = await request.formData();
		const text = (key: string) => {
			const value = formData.get(key);
			return typeof value === 'string' ? value : '';
		};
		const values = { name: text('name'), icon: text('icon') };
		const result = await createGroup(db, user.id, values, requestClock(cookies));
		if (!result.ok) return fail(400, { values, errors: { [result.field]: result.message } });
		redirect(303, `/groups/${result.groupId}`);
	}
};
