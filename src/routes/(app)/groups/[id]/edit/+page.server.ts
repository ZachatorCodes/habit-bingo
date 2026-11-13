import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';

import { requestClock, requireDb } from '#lib/server/request.ts';
import { getMembership, updateGroup } from '#lib/server/groups.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Groups are not available right now.';

/** Owner only: anyone else gets the same 404 as a stranger. */
export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const user = requireUser(locals);
	const membership = await getMembership(
		requireDb(UNAVAILABLE),
		user.id,
		params.id,
		requestClock(cookies)
	);
	if (membership?.role !== 'owner') error(404, 'Not found');
	return { group: membership.group };
};

export const actions: Actions = {
	default: async ({ locals, request, params }) => {
		const user = requireUser(locals);
		const formData = await request.formData();
		const text = (key: string) => {
			const value = formData.get(key);
			return typeof value === 'string' ? value : '';
		};
		const values = { name: text('name'), icon: text('icon') };
		const result = await updateGroup(requireDb(UNAVAILABLE), user.id, params.id, values);
		if (!result) error(404, 'Not found');
		if (!result.ok) return fail(400, { values, errors: { [result.field]: result.message } });
		redirect(303, `/groups/${params.id}?updated=1`);
	}
};
