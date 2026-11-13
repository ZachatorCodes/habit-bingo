import { error, fail, redirect } from '@sveltejs/kit';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, IP_LIMIT_MULTIPLIER } from '$app/env/private';
import {
	googleErrorMessage,
	redirectToGoogle,
	startGoogleSignIn
} from '#lib/server/auth/google.ts';
import { getAuth } from '#lib/server/auth/index.ts';
import { checkAndRecordIp, TOO_MANY_ATTEMPTS_MESSAGE } from '#lib/server/auth/ip-limit.ts';
import {
	DEFAULT_SIGNED_IN_PATH,
	safeNextPath,
	signInWithPassword,
	WRONG_CREDENTIALS_MESSAGE
} from '#lib/server/auth/sign-in.ts';
import { formText, requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

type Field = 'username' | 'password' | 'form';

/** Longer than any real username; longer input is refused before it reaches the database. */
const MAX_USERNAME_INPUT = 64;

const googleEnabled = () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

export const load: PageServerLoad = ({ url, locals }) => {
	if (locals.user) redirect(303, DEFAULT_SIGNED_IN_PATH);
	return {
		next: safeNextPath(url.searchParams.get('next')),
		googleEnabled: googleEnabled(),
		// Set by /reset/[token] after a new password is saved.
		passwordUpdated: url.searchParams.get('reset') === 'done',
		// Better Auth sends failed Google sign-ins back here with ?error=<code>.
		googleError: googleErrorMessage(url.searchParams.get('error'))
	};
};

export const actions: Actions = {
	google: async ({ request, locals }) => {
		const next = safeNextPath(formText(await request.formData(), 'next'));
		if (locals.user) redirect(303, next);
		if (!googleEnabled()) error(404, 'Google sign-in is not available.');
		redirectToGoogle(await startGoogleSignIn(getAuth(), request.headers, next));
	},
	signin: async ({ request, locals, getClientAddress }) => {
		const formData = await request.formData();
		const text = (key: string) => formText(formData, key);
		const next = safeNextPath(text('next'));
		if (locals.user) redirect(303, next);

		const username = text('username').trim();
		const password = text('password');
		// Echoed back on errors so nobody retypes it. Never the password.
		const values = { username };

		const failWith = (errors: Partial<Record<Field, string>>, status = 400) =>
			fail(status, { values, errors });

		const db = requireDb('Sign-in is not available right now.');
		// Per-IP limit first, so a blocked client never reaches Better Auth or the username lockout.
		const ipAllowed = await checkAndRecordIp(
			db,
			'signin',
			getClientAddress(),
			new Date(),
			IP_LIMIT_MULTIPLIER
		);
		if (!ipAllowed) return failWith({ form: TOO_MANY_ATTEMPTS_MESSAGE }, 429);

		const errors: Partial<Record<Field, string>> = {};
		if (!username) errors.username = 'Enter your username.';
		if (!password) errors.password = 'Enter your password.';
		if (errors.username || errors.password) return failWith(errors);
		if (username.length > MAX_USERNAME_INPUT) return failWith({ form: WRONG_CREDENTIALS_MESSAGE });

		const result = await signInWithPassword(
			getAuth(),
			db,
			{ username, password },
			request.headers,
			new Date()
		);
		if (!result.ok) return failWith({ form: result.message });

		redirect(303, next);
	}
};
