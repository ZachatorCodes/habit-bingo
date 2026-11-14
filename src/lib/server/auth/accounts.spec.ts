import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { AVATAR_ICONS } from '#lib/game/icons.ts';
import type { Db } from '#lib/server/db/client.ts';
import { account, passwordReset, session, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import type { Auth } from './create-auth.ts';
import { createGroup, getMembership, groupForInvite, joinGroup } from '#lib/server/groups.ts';
import { group, groupMember } from '#lib/server/db/schema.ts';
import { createInvite } from './invites.ts';
import { createTestAuth } from './test-auth.ts';
import {
	changeUserPassword,
	completeOnboarding,
	deleteAccount,
	getSignInMethods,
	setUserPassword,
	unlinkGoogle,
	updateProfile,
	updateSettings,
	validateProfileInput,
	validateSettingsInput
} from './accounts.ts';

let db: Db;
const NOW = new Date('2026-10-10T12:00:00Z');
const base = {
	name: 'Zach',
	avatarIcon: 'cat',
	timezone: 'Europe/London',
	weekStartsOn: 'sunday' as const
};

async function makeUser(username?: string | null) {
	const id = crypto.randomUUID();
	if (username === undefined) username = `u_${id.slice(0, 8)}`;
	await db.insert(user).values({
		id,
		name: 'Old',
		email: `${id}@users.invalid`,
		username,
		displayUsername: username
	});
	return id;
}

async function row(id: string) {
	const [r] = await db.select().from(user).where(eq(user.id, id));
	return r;
}

beforeEach(async () => {
	db = await createTestDb();
});

describe('completeOnboarding', () => {
	it('saves the profile and marks the user onboarded', async () => {
		const id = await makeUser();
		expect(await completeOnboarding(db, id, base, NOW)).toEqual({ ok: true });
		expect(await row(id)).toMatchObject({
			name: 'Zach',
			avatarIcon: 'cat',
			timezone: 'Europe/London',
			weekStartsOn: 'sunday',
			onboardedAt: NOW,
			username: expect.stringMatching(/^u_/)
		});
	});

	it('accepts every avatar in the list and nothing else', async () => {
		for (const avatarIcon of AVATAR_ICONS) {
			const id = await makeUser();
			expect(await completeOnboarding(db, id, { ...base, avatarIcon }, NOW)).toEqual({ ok: true });
		}
		const id = await makeUser();
		expect(await completeOnboarding(db, id, { ...base, avatarIcon: 'nope' }, NOW)).toMatchObject({
			ok: false,
			field: 'avatarIcon'
		});
		expect((await row(id)).onboardedAt).toBeNull();
	});

	it('rejects unknown timezones', async () => {
		const id = await makeUser();
		expect(
			await completeOnboarding(db, id, { ...base, timezone: 'Mars/Olympus' }, NOW)
		).toMatchObject({ ok: false, field: 'timezone' });
		expect((await row(id)).onboardedAt).toBeNull();
	});

	it('rejects an unknown week start', async () => {
		const id = await makeUser();
		expect(
			await completeOnboarding(db, id, { ...base, weekStartsOn: 'friday' as never }, NOW)
		).toMatchObject({ ok: false, field: 'weekStartsOn' });
	});

	it('requires a username only for users who do not have one', async () => {
		const withName = await makeUser();
		expect((await completeOnboarding(db, withName, base, NOW)).ok).toBe(true);

		const without = await makeUser(null);
		expect(await completeOnboarding(db, without, base, NOW)).toMatchObject({
			ok: false,
			field: 'username',
			message: 'Use 3–20 letters, numbers or underscores.'
		});
		expect(await completeOnboarding(db, without, { ...base, username: 'a b' }, NOW)).toMatchObject({
			ok: false,
			field: 'username'
		});
		expect(
			await completeOnboarding(db, without, { ...base, username: 'Google_Zach' }, NOW)
		).toEqual({ ok: true });
		expect(await row(without)).toMatchObject({
			username: 'google_zach',
			displayUsername: 'Google_Zach'
		});
	});

	it('does not change the username of a user who has one', async () => {
		const id = await makeUser('keeper');
		await completeOnboarding(db, id, { ...base, username: 'other_name' }, NOW);
		expect((await row(id)).username).toBe('keeper');
	});

	it('reports a taken username case-insensitively', async () => {
		await makeUser('taken_name');
		const id = await makeUser(null);
		expect(await completeOnboarding(db, id, { ...base, username: 'Taken_Name' }, NOW)).toEqual({
			ok: false,
			field: 'username',
			message: 'That username is taken.'
		});
		expect((await row(id)).onboardedAt).toBeNull();
	});

	it('trims the display name and enforces 1–40 characters', async () => {
		const id = await makeUser();
		expect(await completeOnboarding(db, id, { ...base, name: '   ' }, NOW)).toMatchObject({
			ok: false,
			field: 'name'
		});
		expect(await completeOnboarding(db, id, { ...base, name: 'x'.repeat(41) }, NOW)).toMatchObject({
			ok: false,
			field: 'name'
		});
		expect(await completeOnboarding(db, id, { ...base, name: '  Zed  ' }, NOW)).toEqual({
			ok: true
		});
		expect((await row(id)).name).toBe('Zed');
		const id2 = await makeUser();
		await completeOnboarding(db, id2, { ...base, name: 'x'.repeat(40) }, NOW);
		expect((await row(id2)).name).toHaveLength(40);
	});
});

describe('validators', () => {
	it('validateProfileInput trims and checks the avatar', () => {
		expect(validateProfileInput({ name: ' A ', avatarIcon: 'smiley' })).toEqual({
			ok: true,
			name: 'A'
		});
		expect(validateProfileInput({ name: 'A', avatarIcon: 'x' })).toMatchObject({
			ok: false,
			field: 'avatarIcon'
		});
	});

	it('validateSettingsInput checks timezone and week start', () => {
		expect(validateSettingsInput({ timezone: 'UTC', weekStartsOn: 'monday' })).toEqual({
			ok: true,
			timezone: 'UTC',
			weekStartsOn: 'monday'
		});
		expect(validateSettingsInput({ timezone: 'Nope', weekStartsOn: 'monday' })).toMatchObject({
			ok: false,
			field: 'timezone'
		});
		expect(validateSettingsInput({ timezone: 'UTC', weekStartsOn: 'x' })).toMatchObject({
			ok: false,
			field: 'weekStartsOn'
		});
	});
});

describe('updateProfile', () => {
	it('updates display name and avatar with the onboarding rules', async () => {
		const id = await makeUser();
		expect(await updateProfile(db, id, { name: '  New Name ', avatarIcon: 'dog' })).toEqual({
			ok: true
		});
		expect(await row(id)).toMatchObject({ name: 'New Name', avatarIcon: 'dog' });

		expect(await updateProfile(db, id, { name: ' ', avatarIcon: 'dog' })).toEqual({
			ok: false,
			field: 'name',
			message: 'Enter a display name.'
		});
		expect(await updateProfile(db, id, { name: 'x'.repeat(41), avatarIcon: 'dog' })).toMatchObject({
			ok: false,
			field: 'name'
		});
		expect(await updateProfile(db, id, { name: 'Fine', avatarIcon: 'nope' })).toMatchObject({
			ok: false,
			field: 'avatarIcon'
		});
		expect(await row(id)).toMatchObject({ name: 'New Name', avatarIcon: 'dog' });
	});

	it('only changes the given user', async () => {
		const id = await makeUser();
		const other = await makeUser();
		await updateProfile(db, id, { name: 'Changed', avatarIcon: 'star' });
		expect((await row(other)).name).toBe('Old');
	});
});

describe('updateSettings', () => {
	it('updates timezone and week start with the onboarding rules', async () => {
		const id = await makeUser();
		expect(
			await updateSettings(db, id, { timezone: 'America/New_York', weekStartsOn: 'sunday' })
		).toEqual({ ok: true });
		expect(await row(id)).toMatchObject({ timezone: 'America/New_York', weekStartsOn: 'sunday' });

		expect(
			await updateSettings(db, id, { timezone: 'Mars/Olympus', weekStartsOn: 'monday' })
		).toMatchObject({ ok: false, field: 'timezone' });
		expect(
			await updateSettings(db, id, { timezone: 'UTC', weekStartsOn: 'friday' as never })
		).toMatchObject({ ok: false, field: 'weekStartsOn' });
		expect(await row(id)).toMatchObject({ timezone: 'America/New_York', weekStartsOn: 'sunday' });
	});
});

async function addAccount(userId: string, providerId: string, password: string | null = null) {
	await db.insert(account).values({
		id: crypto.randomUUID(),
		accountId: providerId === 'credential' ? userId : `google-${userId}`,
		providerId,
		userId,
		password
	});
}

describe('getSignInMethods', () => {
	it('reports which sign-in methods exist', async () => {
		const none = await makeUser();
		expect(await getSignInMethods(db, none)).toEqual({ password: false, google: false });

		const pw = await makeUser();
		await addAccount(pw, 'credential', 'hash');
		expect(await getSignInMethods(db, pw)).toEqual({ password: true, google: false });

		const both = await makeUser();
		await addAccount(both, 'credential', 'hash');
		await addAccount(both, 'google');
		expect(await getSignInMethods(db, both)).toEqual({ password: true, google: true });

		const googleOnly = await makeUser();
		await addAccount(googleOnly, 'google');
		expect(await getSignInMethods(db, googleOnly)).toEqual({ password: false, google: true });

		// A credential account without a password hash is not a usable password.
		const empty = await makeUser();
		await addAccount(empty, 'credential', null);
		expect(await getSignInMethods(db, empty)).toEqual({ password: false, google: false });
	});
});

describe('deleteAccount', () => {
	it('deleting an account removes the user, sessions, accounts and reset links', async () => {
		const id = await makeUser();
		const admin = await makeUser();
		await addAccount(id, 'credential', 'hash');
		await addAccount(id, 'google');
		await db.insert(session).values({
			id: crypto.randomUUID(),
			token: crypto.randomUUID(),
			userId: id,
			expiresAt: new Date(Date.now() + 60_000)
		});
		await db.insert(passwordReset).values({
			tokenHash: 'a'.repeat(64),
			userId: id,
			createdBy: admin,
			expiresAt: new Date(Date.now() + 60_000)
		});
		const keepSession = crypto.randomUUID();
		await db.insert(session).values({
			id: keepSession,
			token: crypto.randomUUID(),
			userId: admin,
			expiresAt: new Date(Date.now() + 60_000)
		});

		await deleteAccount(db, id);

		expect(await db.select().from(user).where(eq(user.id, id))).toEqual([]);
		expect(await db.select().from(session).where(eq(session.userId, id))).toEqual([]);
		expect(await db.select().from(account).where(eq(account.userId, id))).toEqual([]);
		expect(await db.select().from(passwordReset).where(eq(passwordReset.userId, id))).toEqual([]);
		// Nobody else is touched.
		expect(await row(admin)).toBeDefined();
		expect(await db.select().from(session).where(eq(session.id, keepSession))).toHaveLength(1);
	});
});

describe('deleteAccount and groups', () => {
	async function groupOf(ownerId: string) {
		const made = await createGroup(db, ownerId, { name: 'Crew', icon: 'rocket' }, NOW);
		if (!made.ok) throw new Error(made.message);
		const code = (await getMembership(db, ownerId, made.groupId, NOW))!.inviteCode;
		return { groupId: made.groupId, code };
	}

	it('promotes the earliest-joined member when the owner deletes their account', async () => {
		const owner = await makeUser();
		const [first, second] = [await makeUser(), await makeUser()];
		const { groupId, code } = await groupOf(owner);
		await joinGroup(db, first, code, new Date('2026-10-11T00:00:00Z'));
		await joinGroup(db, second, code, new Date('2026-10-12T00:00:00Z'));

		await deleteAccount(db, owner);

		const members = await db.select().from(groupMember).where(eq(groupMember.groupId, groupId));
		expect(members.find((m) => m.userId === first)!.role).toBe('owner');
		expect(members.find((m) => m.userId === second)!.role).toBe('member');
	});

	it('deletes the group and kills its link when the last member deletes their account', async () => {
		const owner = await makeUser();
		const { groupId, code } = await groupOf(owner);

		await deleteAccount(db, owner);

		expect(await db.select().from(group).where(eq(group.id, groupId))).toEqual([]);
		expect(await groupForInvite(db, code, new Date())).toBe('dead');
	});
});

describe('password and sign-in method changes', () => {
	const PASSWORD = 'correct horse battery';
	let auth: Auth;

	beforeEach(async () => {
		auth = createTestAuth(db);
	});

	/** Signs up `name` with a password and returns its id and session headers. */
	async function signedIn(name: string) {
		const inviter = await makeUser();
		const { code } = await createInvite(
			db,
			{ createdBy: inviter, expiresInDays: 7, maxUses: 5 },
			new Date()
		);
		const { headers: set, response } = await auth.api.signUpEmail({
			body: {
				email: `${crypto.randomUUID()}@users.invalid`,
				password: PASSWORD,
				name,
				username: name
			},
			headers: new Headers({ cookie: `hb_invite=${code}` }),
			returnHeaders: true
		});
		const cookie = set
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		return { id: response.user.id, headers: new Headers({ cookie }) };
	}

	async function sessionCount(userId: string) {
		return (await db.select().from(session).where(eq(session.userId, userId))).length;
	}

	it('changes the password and ends every other session', async () => {
		const { id, headers } = await signedIn('changer');
		await auth.api.signInUsername({ body: { username: 'changer', password: PASSWORD } });
		expect(await sessionCount(id)).toBe(2);

		expect(
			await changeUserPassword(auth, headers, {
				currentPassword: PASSWORD,
				newPassword: 'a brand new passphrase'
			})
		).toEqual({ ok: true });
		// The two old sessions are gone; one new one replaces the current device's.
		expect(await sessionCount(id)).toBe(1);
		await expect(
			auth.api.signInUsername({ body: { username: 'changer', password: 'a brand new passphrase' } })
		).resolves.toMatchObject({ token: expect.any(String) });
	});

	it('maps a wrong current password and policy problems to fields', async () => {
		const { headers } = await signedIn('mapper');
		expect(
			await changeUserPassword(auth, headers, {
				currentPassword: 'not my password',
				newPassword: 'a brand new passphrase'
			})
		).toEqual({
			ok: false,
			field: 'currentPassword',
			message: "That's not your current password."
		});
		expect(
			await changeUserPassword(auth, headers, { currentPassword: PASSWORD, newPassword: 'short' })
		).toEqual({ ok: false, field: 'newPassword', message: 'Use at least 10 characters.' });
		expect(
			await changeUserPassword(auth, headers, { currentPassword: PASSWORD, newPassword: 'MAPPER' })
		).toMatchObject({ ok: false, field: 'newPassword' });
		expect(
			await changeUserPassword(auth, headers, { currentPassword: '', newPassword: '' })
		).toEqual({ ok: false, field: 'currentPassword', message: 'Enter your current password.' });
	});

	it('sets a password only for users without one', async () => {
		const { headers } = await signedIn('setter');
		expect(await setUserPassword(auth, headers, { newPassword: 'another long password' })).toEqual({
			ok: false,
			field: 'newPassword',
			message: 'You already have a password.'
		});

		// A Google-only user: signed in, with no credential account.
		const { id: googleOnly, headers: googleHeaders } = await signedIn('google_user');
		await db.delete(account).where(eq(account.userId, googleOnly));
		await addAccount(googleOnly, 'google');
		expect(await setUserPassword(auth, googleHeaders, { newPassword: 'short' })).toEqual({
			ok: false,
			field: 'newPassword',
			message: 'Use at least 10 characters.'
		});
		expect(
			await setUserPassword(auth, googleHeaders, { newPassword: 'a long fresh password' })
		).toEqual({ ok: true });
		expect(await getSignInMethods(db, googleOnly)).toEqual({ password: true, google: true });
	});

	it('unlinks Google only when a password remains', async () => {
		const { id, headers } = await signedIn('linker');
		expect(await unlinkGoogle(auth, db, id, headers)).toEqual({
			ok: false,
			field: 'google',
			message: 'Google is not linked.'
		});
		await addAccount(id, 'google');
		expect(await unlinkGoogle(auth, db, id, headers)).toEqual({ ok: true });
		expect(await getSignInMethods(db, id)).toEqual({ password: true, google: false });

		const googleOnly = await makeUser();
		await addAccount(googleOnly, 'google');
		expect(await unlinkGoogle(auth, db, googleOnly, new Headers())).toEqual({
			ok: false,
			field: 'google',
			message: 'Set a password first so you can still sign in.'
		});
		expect(await getSignInMethods(db, googleOnly)).toEqual({ password: false, google: true });
	});
});
