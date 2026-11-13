import { fail, redirect } from '@sveltejs/kit';
import { IP_LIMIT_MULTIPLIER } from '$app/env/private';
import { getAuth } from '#lib/server/auth/index.ts';
import { checkAndRecordIp, TOO_MANY_ATTEMPTS_MESSAGE } from '#lib/server/auth/ip-limit.ts';
import { getResetStatus, getResetUsername, useResetLink } from '#lib/server/auth/password-reset.ts';
import { isPwnedPassword } from '#lib/server/auth/pwned.ts';
import { requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Password resets are not available right now.';

// No-store and Referrer-Policy: strict-origin for this route come from `routeHeadersHandle` in hooks.server.ts.
// Public, so signed-in visitors can use a link too.

export const load: PageServerLoad = async ({ params }) => {
	const db = requireDb(UNAVAILABLE);
	const now = new Date();
	const status = await getResetStatus(db, params.token, now);
	// Only a usable link names its account.
	const username = status === 'valid' ? await getResetUsername(db, params.token, now) : null;
	return { status, username };
};

export const actions: Actions = {
	default: async ({ params, request, getClientAddress }) => {
		const db = requireDb(UNAVAILABLE);
		const ipAllowed = await checkAndRecordIp(
			db,
			'reset',
			getClientAddress(),
			new Date(),
			IP_LIMIT_MULTIPLIER
		);
		if (!ipAllowed) return fail(429, { errors: { form: TOO_MANY_ATTEMPTS_MESSAGE } });
		const value = (await request.formData()).get('newPassword');
		const newPassword = typeof value === 'string' ? value : '';
		if (!newPassword) return fail(400, { errors: { newPassword: 'Enter a new password.' } });

		const result = await useResetLink(
			getAuth(),
			db,
			params.token,
			newPassword,
			new Date(),
			isPwnedPassword
		);
		if (!result.ok) {
			// Returning re-runs load, which shows the dead-link page.
			if (result.field === 'link') return fail(400, { status: result.status });
			return fail(400, { errors: { newPassword: result.message } });
		}
		redirect(303, '/signin?reset=done');
	}
};
