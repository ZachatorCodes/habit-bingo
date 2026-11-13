import { error, fail, redirect } from '@sveltejs/kit';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { AVATAR_ICONS } from '#lib/game/icons.ts';
import { deleteConfirmed, timezoneOptions, type WeekStart } from '#lib/game/profile.ts';
import {
	changeUserPassword,
	deleteAccount,
	getSignInMethods,
	setUserPassword,
	unlinkGoogle,
	updateProfile,
	updateSettings
} from '#lib/server/auth/accounts.ts';
import {
	googleLinkErrorMessage,
	redirectToGoogle,
	startGoogleLink
} from '#lib/server/auth/google.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { retireResetLinks } from '#lib/server/auth/password-reset.ts';
import { getAuth } from '#lib/server/auth/index.ts';
import { personOf, readForm, requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Your account is not available right now.';

const DELETE_MISMATCH_MESSAGE = "That doesn't match your username.";

const googleEnabled = () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

/** A failed action: which section it came from, the safe values to refill and the field errors. */
function failed(
	section: string,
	field: string,
	message: string,
	values: Record<string, string> = {}
) {
	return fail(400, { section, values, errors: { [field]: message } as Record<string, string> });
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const db = requireDb(UNAVAILABLE);
	const methods = await getSignInMethods(db, user.id);
	const timezone = personOf(user).timezone;
	return {
		profile: {
			name: user.name,
			avatarIcon: user.avatarIcon ?? AVATAR_ICONS[0],
			displayUsername: user.displayUsername ?? user.username ?? ''
		},
		settings: { timezone, weekStartsOn: personOf(user).weekStartsOn },
		timezones: timezoneOptions(timezone),
		avatars: AVATAR_ICONS,
		methods,
		googleEnabled: googleEnabled(),
		// Better Auth sends failed Google links back here with ?error=<code>.
		googleLinkError: googleLinkErrorMessage(url.searchParams.get('error'))
	};
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		const values = { name: text('name'), avatarIcon: text('avatarIcon') };
		const result = await updateProfile(db, user.id, values);
		if (!result.ok) return failed('profile', result.field, result.message, values);
		return { section: 'profile', saved: true };
	},

	settings: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		const values = { timezone: text('timezone'), weekStartsOn: text('weekStartsOn') };
		const result = await updateSettings(db, user.id, {
			timezone: values.timezone,
			weekStartsOn: values.weekStartsOn as WeekStart
		});
		if (!result.ok) return failed('settings', result.field, result.message, values);
		return { section: 'settings', saved: true };
	},

	changePassword: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		if (!(await getSignInMethods(db, user.id)).password)
			return failed('password', 'form', 'You have no password yet. Set one instead.');
		// Passwords are never echoed back.
		const result = await changeUserPassword(getAuth(), request.headers, {
			currentPassword: text('currentPassword'),
			newPassword: text('newPassword')
		});
		if (!result.ok) return failed('password', result.field, result.message);
		await retireResetLinks(db, user.id, new Date());
		return { section: 'password', saved: true };
	},

	setPassword: async ({ request, locals }) => {
		const user = requireUser(locals);
		const text = await readForm(request);
		const result = await setUserPassword(getAuth(), request.headers, {
			newPassword: text('newPassword')
		});
		if (!result.ok) return failed('password', result.field, result.message);
		await retireResetLinks(requireDb(UNAVAILABLE), user.id, new Date());
		return { section: 'password', saved: true };
	},

	linkGoogle: async ({ request, locals }) => {
		const user = requireUser(locals);
		if (!googleEnabled()) error(404, 'Google sign-in is not available.');
		if ((await getSignInMethods(requireDb(UNAVAILABLE), user.id)).google)
			return failed('methods', 'google', 'Google is already linked.');
		redirectToGoogle(await startGoogleLink(getAuth(), request.headers));
	},

	unlinkGoogle: async ({ request, locals }) => {
		const user = requireUser(locals);
		const result = await unlinkGoogle(getAuth(), requireDb(UNAVAILABLE), user.id, request.headers);
		if (!result.ok) return failed('methods', result.field, result.message);
		return { section: 'methods', saved: true };
	},

	signOutEverywhere: async ({ request, locals }) => {
		requireUser(locals);
		const auth = getAuth();
		// Deletes every session row, so copied cookies stop working too (Review Focus 4); signing
		// out afterwards clears this browser's cookies.
		await auth.api.revokeSessions({ headers: request.headers });
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/signin');
	},

	deleteAccount: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		if (!deleteConfirmed(text('confirmUsername'), user))
			return failed('delete', 'confirmUsername', DELETE_MISMATCH_MESSAGE);
		await deleteAccount(db, user.id);
		// The session rows went with the user; this clears the cookies on our response.
		await getAuth().api.signOut({ headers: request.headers });
		redirect(303, '/');
	}
};
