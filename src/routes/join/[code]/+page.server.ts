import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import * as z from 'zod';
import {
	BOOTSTRAP_INVITE_CODE,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	IP_LIMIT_MULTIPLIER
} from '$app/env/private';
import { INVITE_COOKIE } from '#lib/server/auth/create-auth.ts';
import { redirectToGoogle, startGoogleSignIn } from '#lib/server/auth/google.ts';
import { getAuth } from '#lib/server/auth/index.ts';
import { getJoinStatus } from '#lib/server/auth/invites.ts';
import { checkAndRecordIp, TOO_MANY_ATTEMPTS_MESSAGE } from '#lib/server/auth/ip-limit.ts';
import { checkPassword, PASSWORD_MESSAGES } from '#lib/server/auth/password-policy.ts';
import { signUpWithPassword, USERNAME_RULES_MESSAGE } from '#lib/server/auth/sign-up.ts';

import { formText, requestClock, requireDb } from '#lib/server/request.ts';
import { DEAD_LINK_MESSAGE, getMembership, groupForInvite, joinGroup } from '#lib/server/groups.ts';
import type { Actions, PageServerLoad } from './$types';

type Field = 'username' | 'name' | 'password' | 'form';

const signUpForm = z
	.object({
		username: z
			.string({ error: USERNAME_RULES_MESSAGE })
			.trim()
			.regex(/^[a-z0-9_]{3,20}$/i, { error: USERNAME_RULES_MESSAGE }),
		name: z
			.string({ error: 'Enter a display name.' })
			.trim()
			.min(1, { error: 'Enter a display name.' })
			.max(40, { error: 'Use at most 40 characters.' }),
		password: z.string({ error: PASSWORD_MESSAGES.tooShort })
	})
	.superRefine(async ({ username, password }, ctx) => {
		// The local rules only, so every field's problem shows at once. The breach lookup runs in the
		// sign-up hook, after these pass.
		const problem = await checkPassword(password, username, async () => false);
		if (problem)
			ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MESSAGES[problem] });
	});

const googleEnabled = () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

/** Read again when the account is created, by either sign-up method. */
function setInviteCookie(cookies: Cookies, code: string) {
	cookies.set(INVITE_COOKIE, code, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 3600
	});
}

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const db = requireDb('Sign-up is not available right now.');
	if (locals.user) {
		const now = requestClock(cookies);
		const found = await groupForInvite(db, params.code, now);
		if (!found) redirect(303, '/today');
		if (found === 'dead') return { status: 'groupDead' as const, message: DEAD_LINK_MESSAGE };
		const member = Boolean(await getMembership(db, locals.user.id, found.group.id, now));
		return { status: 'group' as const, ...found, member };
	}

	const status = await getJoinStatus(db, params.code, new Date(), BOOTSTRAP_INVITE_CODE);
	// Dead invites get a friendly page and no cookie (Review Focus 3).
	if (status !== 'valid') return { status };

	setInviteCookie(cookies, params.code);
	return { status, googleEnabled: googleEnabled() };
};

export const actions: Actions = {
	join: async ({ params, cookies, locals }) => {
		if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(`/join/${params.code}`)}`);
		const db = requireDb('Groups are not available right now.');
		const result = await joinGroup(db, locals.user.id, params.code, requestClock(cookies));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/groups/${result.groupId}`);
	},
	google: async ({ params, request, cookies, locals }) => {
		if (locals.user) redirect(303, '/today');
		if (!googleEnabled()) error(404, 'Google sign-in is not available.');
		const db = requireDb('Sign-up is not available right now.');

		// The invite may have expired or been used up since the page loaded. Returning re-runs load,
		// which shows the dead-invite page (Review Focus 3).
		const status = await getJoinStatus(db, params.code, new Date(), BOOTSTRAP_INVITE_CODE);
		if (status !== 'valid') return fail(400, { status });

		// Google brings the visitor back to our callback, where the create-user hook reads this
		// cookie and uses the invite. Returning Google users never reach that hook.
		setInviteCookie(cookies, params.code);
		redirectToGoogle(await startGoogleSignIn(getAuth(), request.headers, '/today'));
	},
	signup: async ({ request, cookies, locals, getClientAddress }) => {
		if (locals.user) redirect(303, '/today');
		const formData = await request.formData();
		const text = (key: string) => formText(formData, key);
		// Echoed back on errors so nobody retypes them. Never the password.
		const values = { username: text('username'), name: text('name') };

		const db = requireDb('Sign-up is not available right now.');
		const ipAllowed = await checkAndRecordIp(
			db,
			'signup',
			getClientAddress(),
			new Date(),
			IP_LIMIT_MULTIPLIER
		);
		if (!ipAllowed) {
			const errors: Partial<Record<Field, string>> = { form: TOO_MANY_ATTEMPTS_MESSAGE };
			return fail(429, { values, errors });
		}

		const parsed = await signUpForm.safeParseAsync({
			username: formData.get('username'),
			name: formData.get('name'),
			password: formData.get('password')
		});
		if (!parsed.success) {
			const errors: Partial<Record<Field, string>> = {};
			for (const issue of parsed.error.issues) {
				const field = issue.path[0] as Field;
				errors[field] ??= issue.message;
			}
			return fail(400, { values, errors });
		}

		const result = await signUpWithPassword(getAuth(), parsed.data, request.headers);
		if (!result.ok) {
			const errors: Partial<Record<Field, string>> = { [result.field]: result.message };
			return fail(400, { values, errors });
		}

		cookies.delete(INVITE_COOKIE, { path: '/' });
		redirect(303, '/onboarding');
	}
};
