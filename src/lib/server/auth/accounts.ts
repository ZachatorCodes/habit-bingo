import { APIError } from 'better-auth/api';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { AVATAR_ICONS } from '#lib/game/icons.ts';
import { isValidTimezone, type WeekStart } from '#lib/game/profile.ts';
import type { Db } from '#lib/server/db/client.ts';
import { account, user } from '#lib/server/db/schema.ts';
import { leaveGroup, listGroups } from '#lib/server/groups.ts';
import type { Auth } from './create-auth.ts';
import { PASSWORD_MESSAGES } from './password-policy.ts';
import { isUniqueViolation, USERNAME_RULES_MESSAGE, USERNAME_TAKEN_MESSAGE } from './sign-up.ts';

export type Invalid = { ok: false; field: string; message: string };
export type Result = { ok: true } | Invalid;

/** Display name (trimmed, 1–40 characters) and avatar. */
export function validateProfileInput(input: {
	name: string;
	avatarIcon: string;
}): { ok: true; name: string } | Invalid {
	const name = input.name.trim();
	if (name.length < 1) return { ok: false, field: 'name', message: 'Enter a display name.' };
	if ([...name].length > 40)
		return { ok: false, field: 'name', message: 'Use at most 40 characters.' };
	if (!(AVATAR_ICONS as readonly string[]).includes(input.avatarIcon))
		return { ok: false, field: 'avatarIcon', message: 'Pick one of the avatars.' };
	return { ok: true, name };
}

/** Timezone and week start. */
export function validateSettingsInput(input: {
	timezone: string;
	weekStartsOn: string;
}): { ok: true; timezone: string; weekStartsOn: WeekStart } | Invalid {
	if (!isValidTimezone(input.timezone))
		return { ok: false, field: 'timezone', message: 'Pick a valid timezone.' };
	if (input.weekStartsOn !== 'monday' && input.weekStartsOn !== 'sunday')
		return { ok: false, field: 'weekStartsOn', message: 'Pick Monday or Sunday.' };
	return { ok: true, timezone: input.timezone, weekStartsOn: input.weekStartsOn };
}

/**
 * Finishes first-run setup. `username` is only needed (and only used) when the user has none, as
 * with Google sign-ups.
 */
export async function completeOnboarding(
	db: Db,
	userId: string,
	input: {
		username?: string;
		name: string;
		avatarIcon: string;
		timezone: string;
		weekStartsOn: WeekStart;
	},
	now: Date
): Promise<{ ok: true } | Invalid> {
	const profile = validateProfileInput(input);
	if (!profile.ok) return profile;
	const settings = validateSettingsInput(input);
	if (!settings.ok) return settings;

	const [current] = await db.select().from(user).where(eq(user.id, userId));
	if (!current) return { ok: false, field: 'form', message: 'We could not find your account.' };

	let username: { username: string; displayUsername: string } | undefined;
	if (!current.username) {
		const typed = (input.username ?? '').trim();
		if (!/^[a-z0-9_]{3,20}$/i.test(typed))
			return { ok: false, field: 'username', message: USERNAME_RULES_MESSAGE };
		username = { username: typed.toLowerCase(), displayUsername: typed };
		const [taken] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.username, username.username));
		if (taken) return { ok: false, field: 'username', message: USERNAME_TAKEN_MESSAGE };
	}

	try {
		await db
			.update(user)
			.set({
				...username,
				name: profile.name,
				avatarIcon: input.avatarIcon,
				timezone: settings.timezone,
				weekStartsOn: settings.weekStartsOn,
				onboardedAt: now
			})
			// Only fill a missing username; never overwrite one set meanwhile.
			.where(username ? and(eq(user.id, userId), isNull(user.username)) : eq(user.id, userId));
	} catch (error) {
		if (username && isUniqueViolation(error))
			return { ok: false, field: 'username', message: USERNAME_TAKEN_MESSAGE };
		throw error;
	}
	return { ok: true };
}

/** Changes the display name and avatar, with the onboarding rules. */
export async function updateProfile(
	db: Db,
	userId: string,
	input: { name: string; avatarIcon: string }
): Promise<Result> {
	const profile = validateProfileInput(input);
	if (!profile.ok) return profile;
	await db
		.update(user)
		.set({ name: profile.name, avatarIcon: input.avatarIcon })
		.where(eq(user.id, userId));
	return { ok: true };
}

/** Changes the timezone and week start, with the onboarding rules. */
export async function updateSettings(
	db: Db,
	userId: string,
	input: { timezone: string; weekStartsOn: WeekStart }
): Promise<Result> {
	const settings = validateSettingsInput(input);
	if (!settings.ok) return settings;
	await db
		.update(user)
		.set({ timezone: settings.timezone, weekStartsOn: settings.weekStartsOn })
		.where(eq(user.id, userId));
	return { ok: true };
}

/** Which ways this user can sign in. A credential account only counts if it has a password. */
export async function getSignInMethods(
	db: Db,
	userId: string
): Promise<{ password: boolean; google: boolean }> {
	const rows = await db
		.select({ providerId: account.providerId })
		.from(account)
		.where(
			and(
				eq(account.userId, userId),
				or(
					and(eq(account.providerId, 'credential'), isNotNull(account.password)),
					eq(account.providerId, 'google')
				)
			)
		);
	return {
		password: rows.some((r) => r.providerId === 'credential'),
		google: rows.some((r) => r.providerId === 'google')
	};
}

/** Deletes the user row; sessions, accounts, reset links and everything else cascade. */
export async function deleteAccount(db: Db, userId: string, now = new Date()): Promise<void> {
	// Leave each group first so ownership passes on and an empty group's link dies.
	for (const g of await listGroups(db, userId)) await leaveGroup(db, userId, g.id, now);
	await db.delete(user).where(eq(user.id, userId));
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = "That's not your current password.";
export const PASSWORD_ALREADY_SET_MESSAGE = 'You already have a password.';
export const KEEP_A_SIGN_IN_METHOD_MESSAGE = 'Set a password first so you can still sign in.';
export const GOOGLE_NOT_LINKED_MESSAGE = 'Google is not linked.';
export const SIGN_IN_AGAIN_MESSAGE = 'For your safety, sign out and back in, then try again.';

/** Better Auth's password policy codes (from our hook and its own checks) as new-password errors. */
function newPasswordProblem(code: string | undefined): Invalid | undefined {
	const message =
		code === 'PASSWORD_TOO_SHORT'
			? PASSWORD_MESSAGES.tooShort
			: code === 'PASSWORD_TOO_LONG'
				? PASSWORD_MESSAGES.tooLong
				: code && code in PASSWORD_MESSAGES
					? PASSWORD_MESSAGES[code as keyof typeof PASSWORD_MESSAGES]
					: undefined;
	return message ? { ok: false, field: 'newPassword', message } : undefined;
}

function apiErrorCode(error: unknown): string | undefined {
	return error instanceof APIError ? (error.body?.code as string | undefined) : undefined;
}

/**
 * Changes the signed-in user's password (checked by our policy hook) and ends every other session.
 * Better Auth replaces this device's session and sets its cookie on the current response.
 */
export async function changeUserPassword(
	auth: Auth,
	headers: Headers,
	input: { currentPassword: string; newPassword: string }
): Promise<Result> {
	if (!input.currentPassword)
		return { ok: false, field: 'currentPassword', message: 'Enter your current password.' };
	if (!input.newPassword)
		return { ok: false, field: 'newPassword', message: 'Enter a new password.' };
	try {
		await auth.api.changePassword({
			body: {
				currentPassword: input.currentPassword,
				newPassword: input.newPassword,
				revokeOtherSessions: true
			},
			headers
		});
		return { ok: true };
	} catch (error) {
		const code = apiErrorCode(error);
		if (code === 'INVALID_PASSWORD')
			return { ok: false, field: 'currentPassword', message: WRONG_CURRENT_PASSWORD_MESSAGE };
		const problem = newPasswordProblem(code);
		if (problem) return problem;
		throw error;
	}
}

/** Adds a password for a signed-in user who has none (e.g. a Google sign-up). */
export async function setUserPassword(
	auth: Auth,
	headers: Headers,
	input: { newPassword: string }
): Promise<Result> {
	if (!input.newPassword)
		return { ok: false, field: 'newPassword', message: 'Enter a new password.' };
	try {
		await auth.api.setPassword({ body: { newPassword: input.newPassword }, headers });
		return { ok: true };
	} catch (error) {
		const code = apiErrorCode(error);
		if (code === 'PASSWORD_ALREADY_SET')
			return { ok: false, field: 'newPassword', message: PASSWORD_ALREADY_SET_MESSAGE };
		const problem = newPasswordProblem(code);
		if (problem) return problem;
		throw error;
	}
}

/**
 * Unlinks Google from a signed-in user, refusing when it is their only way to sign in. Better Auth
 * asks for a recently created session; older sessions get a "sign in again" message.
 */
export async function unlinkGoogle(
	auth: Auth,
	db: Db,
	userId: string,
	headers: Headers
): Promise<Result> {
	const methods = await getSignInMethods(db, userId);
	if (!methods.google) return { ok: false, field: 'google', message: GOOGLE_NOT_LINKED_MESSAGE };
	if (!methods.password)
		return { ok: false, field: 'google', message: KEEP_A_SIGN_IN_METHOD_MESSAGE };
	const [google] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'google')));
	try {
		await auth.api.unlinkAccount({ body: { accountId: google.id }, headers });
		return { ok: true };
	} catch (error) {
		const code = apiErrorCode(error);
		if (code === 'SESSION_NOT_FRESH')
			return { ok: false, field: 'google', message: SIGN_IN_AGAIN_MESSAGE };
		if (code === 'FAILED_TO_UNLINK_LAST_ACCOUNT')
			return { ok: false, field: 'google', message: KEEP_A_SIGN_IN_METHOD_MESSAGE };
		throw error;
	}
}
