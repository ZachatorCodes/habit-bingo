import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/client.ts';
import { groupMember, invite, user } from '#lib/server/db/schema.ts';
import { createGroup, getMembership, MAX_MEMBERS } from '#lib/server/groups.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import type { Auth } from './create-auth.ts';
import { createInvite } from './invites.ts';
import { PASSWORD_MESSAGES } from './password-policy.ts';
import {
	signUpWithPassword,
	USERNAME_RULES_MESSAGE,
	USERNAME_TAKEN_MESSAGE,
	validateSignUpForm
} from './sign-up.ts';
import { createTestAuth } from './test-auth.ts';

const PASSWORD = 'correct horse battery';

let db: Db;
let auth: Auth;
let code: string;

beforeEach(async () => {
	db = await createTestDb();
	auth = createTestAuth(db);
	const inviterId = crypto.randomUUID();
	await db
		.insert(user)
		.values({ id: inviterId, name: 'Inviter', email: `${inviterId}@users.invalid` });
	({ code } = await createInvite(
		db,
		{ createdBy: inviterId, expiresInDays: 7, maxUses: 10 },
		new Date()
	));
});

function withInvite(inviteCode: string | null = code) {
	return new Headers(inviteCode === null ? {} : { cookie: `hb_invite=${inviteCode}` });
}

function signUp(
	input: Partial<{ username: string; password: string; name: string }> = {},
	headers = withInvite()
) {
	return signUpWithPassword(
		auth,
		{ username: 'Zach_S', password: PASSWORD, name: 'Zach', ...input },
		headers
	);
}

async function usesOfInvite() {
	const [row] = await db.select().from(invite).where(eq(invite.code, code));
	return row.uses;
}

describe('signUpWithPassword', () => {
	it('creates the user with a placeholder email and the typed username casing', async () => {
		expect(await signUp()).toEqual({ ok: true });
		const [row] = await db.select().from(user).where(eq(user.username, 'zach_s'));
		expect(row.displayUsername).toBe('Zach_S');
		expect(row.name).toBe('Zach');
		expect(row.email).toMatch(/^[0-9a-f-]{36}@users\.invalid$/);
	});

	it('reports a taken username beside the username field', async () => {
		await signUp();
		expect(await signUp({ username: 'zach_s' })).toEqual({
			ok: false,
			field: 'username',
			message: 'That username is taken.'
		});
	});

	it.each(['ab', 'a'.repeat(21), 'has space', 'dash-y'])(
		'reports an invalid username %j beside the username field',
		async (username) => {
			expect(await signUp({ username })).toEqual({
				ok: false,
				field: 'username',
				message: 'Use 3–20 letters, numbers or underscores.'
			});
		}
	);

	it('reports password policy problems beside the password field', async () => {
		expect(await signUp({ password: 'short' })).toEqual({
			ok: false,
			field: 'password',
			message: PASSWORD_MESSAGES.tooShort
		});
		expect(await signUp({ username: 'samesame12', password: 'SameSame12' })).toEqual({
			ok: false,
			field: 'password',
			message: PASSWORD_MESSAGES.sameAsUsername
		});
	});

	it('reports a breached password beside the password field', async () => {
		auth = createTestAuth(db, { isPwned: async () => true });
		expect(await signUp()).toEqual({
			ok: false,
			field: 'password',
			message: PASSWORD_MESSAGES.breached
		});
	});

	it('reports a missing or dead invite as a form error', async () => {
		const expected = { ok: false, field: 'form', message: 'This invite is no longer valid.' };
		expect(await signUp({}, withInvite(null))).toEqual(expected);
		expect(await signUp({}, withInvite('nope'))).toEqual(expected);
	});

	it('does not use up the invite when sign-up fails (Review Focus 2)', async () => {
		await signUp();
		expect(await usesOfInvite()).toBe(1);
		await signUp({ username: 'zach_s' });
		await signUp({ username: 'other', password: 'short' });
		await signUp({ username: 'bad name' });
		expect(await usesOfInvite()).toBe(1);
	});
});

describe('concurrent sign-ups for the same username', () => {
	const uniqueViolation = () =>
		Object.assign(
			new Error('duplicate key value violates unique constraint "user_username_unique"'),
			{
				code: '23505'
			}
		);

	/** An auth whose user insert loses the race: Postgres rejects it as a duplicate. */
	const losingAuth = (error: unknown) =>
		({ api: { signUpEmail: () => Promise.reject(error) } }) as unknown as Auth;

	it.each([
		['the raw driver error', uniqueViolation()],
		['a wrapped driver error', new Error('Failed query', { cause: uniqueViolation() })],
		[
			'a Better Auth error caused by it',
			new APIError('UNPROCESSABLE_ENTITY', {
				message: 'Failed to create user',
				code: 'FAILED_TO_CREATE_USER',
				cause: new Error('Failed query', { cause: uniqueViolation() })
			})
		]
	])('reports the loser as a taken username, given %s', async (_, error) => {
		expect(
			await signUpWithPassword(
				losingAuth(error),
				{ username: 'racer', password: PASSWORD, name: 'Racer' },
				new Headers()
			)
		).toEqual({ ok: false, field: 'username', message: USERNAME_TAKEN_MESSAGE });
	});

	it('still throws other database errors', async () => {
		const outage = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
		await expect(
			signUpWithPassword(
				losingAuth(outage),
				{ username: 'racer', password: PASSWORD, name: 'Racer' },
				new Headers()
			)
		).rejects.toBe(outage);
	});

	it('maps a full group link to a form error', async () => {
		const ownerId = crypto.randomUUID();
		await db.insert(user).values({ id: ownerId, name: 'O', email: `${ownerId}@users.invalid` });
		const made = await createGroup(db, ownerId, { name: 'Crew', icon: 'rocket' }, new Date());
		if (!made.ok) throw new Error(made.message);
		const groupCode = (await getMembership(db, ownerId, made.groupId, new Date()))!.inviteCode;
		const ids = Array.from({ length: MAX_MEMBERS - 1 }, () => crypto.randomUUID());
		await db
			.insert(user)
			.values(ids.map((id) => ({ id, name: 'M', email: `${id}@users.invalid` })));
		await db.insert(groupMember).values(
			ids.map((userId) => ({
				groupId: made.groupId,
				userId,
				role: 'member' as const,
				joinedAt: new Date()
			}))
		);
		expect(await signUp({}, withInvite(groupCode))).toEqual({
			ok: false,
			field: 'form',
			message: 'This group is full.'
		});
	});
});

describe('validateSignUpForm', () => {
	const good = { username: ' Sam_1 ', name: ' Sam ', password: 'long enough pw' };

	it('trims the username and name, and keeps the password as typed', async () => {
		expect(await validateSignUpForm(good)).toEqual({
			ok: true,
			value: { username: 'Sam_1', name: 'Sam', password: 'long enough pw' }
		});
	});

	it('reports every field problem at once, checking the password against the trimmed username', async () => {
		expect(await validateSignUpForm({ username: 'ab', name: ' ', password: 'short' })).toEqual({
			ok: false,
			errors: {
				username: USERNAME_RULES_MESSAGE,
				name: 'Enter a display name.',
				password: PASSWORD_MESSAGES.tooShort
			}
		});
		expect(
			await validateSignUpForm({
				username: ' sam_12345 ',
				name: 'x'.repeat(41),
				password: 'SAM_12345'
			})
		).toEqual({
			ok: false,
			errors: { name: 'Use at most 40 characters.', password: PASSWORD_MESSAGES.tooShort }
		});
		expect(
			await validateSignUpForm({ username: ' sam_123456 ', name: 'Sam', password: 'SAM_123456' })
		).toEqual({ ok: false, errors: { password: PASSWORD_MESSAGES.sameAsUsername } });
	});

	it('checks each field, but skips the password rules when any field is missing', async () => {
		expect(await validateSignUpForm({ username: null, name: 'Sam', password: 'short' })).toEqual({
			ok: false,
			errors: { username: USERNAME_RULES_MESSAGE }
		});
		expect(await validateSignUpForm({ username: 'ab', name: null, password: null })).toEqual({
			ok: false,
			errors: {
				username: USERNAME_RULES_MESSAGE,
				name: 'Enter a display name.',
				password: PASSWORD_MESSAGES.tooShort
			}
		});
	});
});
