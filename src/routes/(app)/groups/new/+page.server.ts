import { fail, redirect } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import { requireUser } from '#lib/server/auth/guards.ts';
import { requestNow } from '#lib/server/clock.ts';
import { requireDb } from '#lib/server/request.ts';
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
		const result = await createGroup(db, user.id, values, requestNow(cookies, TEST_CLOCK));
		if (!result.ok) return fail(400, { values, errors: { [result.field]: result.message } });
		redirect(303, `/groups/${result.groupId}`);
	}
};
