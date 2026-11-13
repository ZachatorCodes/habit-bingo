import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/client.ts';
import { group, invite, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { createTestAuth } from './test-auth.ts';
import {
	validateInviteInput,
	consumeInvite,
	createInvite,
	deleteInvite,
	getInviteStatus,
	getJoinStatus,
	listInvites
} from './invites.ts';

const NOW = new Date('2026-10-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let db: Db;
let adminId: string;

beforeEach(async () => {
	db = await createTestDb();
	adminId = crypto.randomUUID();
	await db.insert(user).values({
		id: adminId,
		name: 'Admin',
		email: `${adminId}@users.invalid`,
		username: 'admin'
	});
});

describe('invites', () => {
	it('creates a 10-byte base64url code with the given limits', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 7, maxUses: 3, groupId: 'g1' },
			NOW
		);
		expect(code).toMatch(/^[A-Za-z0-9_-]{14}$/);
		const [row] = await db.select().from(invite).where(eq(invite.code, code));
		expect(row).toMatchObject({
			createdBy: adminId,
			groupId: 'g1',
			maxUses: 3,
			uses: 0,
			expiresAt: new Date(NOW.getTime() + 7 * DAY)
		});
	});

	it('a new invite is valid until it expires', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 1, maxUses: 1 },
			NOW
		);
		expect(await getInviteStatus(db, code, NOW)).toBe('valid');
		expect(await getInviteStatus(db, code, new Date(NOW.getTime() + DAY - 1))).toBe('valid');
		expect(await getInviteStatus(db, code, new Date(NOW.getTime() + DAY))).toBe('expired');
		expect(await consumeInvite(db, code, new Date(NOW.getTime() + DAY))).toBe(false);
	});

	it('consumes uses atomically and reports usedUp', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 7, maxUses: 1 },
			NOW
		);
		expect(await consumeInvite(db, code, NOW)).toBe(true);
		expect(await consumeInvite(db, code, NOW)).toBe(false);
		expect(await getInviteStatus(db, code, NOW)).toBe('usedUp');
		const [row] = await db.select().from(invite).where(eq(invite.code, code));
		expect(row.uses).toBe(1);
	});

	it('reports notFound for unknown codes', async () => {
		expect(await getInviteStatus(db, 'nope', NOW)).toBe('notFound');
		expect(await consumeInvite(db, 'nope', NOW)).toBe(false);
	});

	it('two concurrent consumes of a one-use invite let exactly one through', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 7, maxUses: 1 },
			NOW
		);
		const results = await Promise.all([consumeInvite(db, code, NOW), consumeInvite(db, code, NOW)]);
		expect(results.sort()).toEqual([false, true]);
	});
});

describe('deleteInvite', () => {
	it('retires a live code once', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 7, maxUses: 3 },
			NOW
		);
		expect(await deleteInvite(db, code, NOW)).toBe(true);
		expect(await getInviteStatus(db, code, NOW)).toBe('expired');
		expect(await deleteInvite(db, code, NOW)).toBe(false);
	});
});

describe('listInvites', () => {
	it('shows only live codes, labelled with their group', async () => {
		const mk = (o: { days?: number; max?: number; groupId?: string }, at = NOW) =>
			createInvite(
				db,
				{ createdBy: adminId, expiresInDays: o.days ?? 7, maxUses: o.max ?? 3, groupId: o.groupId },
				at
			);
		await db.insert(group).values({ id: 'g1', name: 'Crew', icon: 'rocket', createdBy: adminId });
		const { code: expired } = await mk({ days: 1 }, new Date(NOW.getTime() - 2 * DAY));
		const { code: usedUp } = await mk({ max: 1 });
		await consumeInvite(db, usedUp, NOW);
		const { code: deleted } = await mk({});
		await deleteInvite(db, deleted, NOW);
		const { code: admin } = await mk({});
		const { code: link } = await mk({ groupId: 'g1' });
		await db
			.update(invite)
			.set({ createdAt: new Date(NOW.getTime() + 1000) })
			.where(eq(invite.code, link));
		await db.update(invite).set({ createdAt: NOW }).where(eq(invite.code, admin));

		expect(await listInvites(db, NOW)).toEqual([
			{
				code: link,
				uses: 0,
				maxUses: 3,
				expiresAt: expect.any(Date),
				group: { name: 'Crew', icon: 'rocket' }
			},
			{ code: admin, uses: 0, maxUses: 3, expiresAt: expect.any(Date), group: null }
		]);
		expect([expired, usedUp, deleted]).toHaveLength(3);
	});
});

describe('getJoinStatus', () => {
	const BOOTSTRAP = 'bootstrap-code-for-tests';

	it('accepts the bootstrap code while there are no users', async () => {
		const empty = await createTestDb();
		expect(await getJoinStatus(empty, BOOTSTRAP, NOW, BOOTSTRAP)).toBe('valid');
	});

	it('rejects the bootstrap code once any user exists', async () => {
		expect(await getJoinStatus(db, BOOTSTRAP, NOW, BOOTSTRAP)).toBe('notFound');
	});

	it('never treats a missing or empty bootstrap code as valid', async () => {
		const empty = await createTestDb();
		expect(await getJoinStatus(empty, '', NOW, undefined)).toBe('notFound');
		expect(await getJoinStatus(empty, '', NOW, '')).toBe('notFound');
		expect(await getJoinStatus(empty, 'anything', NOW, undefined)).toBe('notFound');
		expect(await getJoinStatus(empty, 'other', NOW, BOOTSTRAP)).toBe('notFound');
	});

	it('leaves normal invites unaffected', async () => {
		const { code } = await createInvite(
			db,
			{ createdBy: adminId, expiresInDays: 1, maxUses: 1 },
			NOW
		);
		expect(await getJoinStatus(db, code, NOW, BOOTSTRAP)).toBe('valid');
		expect(await getJoinStatus(db, code, new Date(NOW.getTime() + 2 * DAY), BOOTSTRAP)).toBe(
			'expired'
		);
	});

	it('lets the first person join with the bootstrap code and become admin', async () => {
		const empty = await createTestDb();
		const auth = createTestAuth(empty, { bootstrapInviteCode: BOOTSTRAP });
		expect(await getJoinStatus(empty, BOOTSTRAP, NOW, BOOTSTRAP)).toBe('valid');
		const { user: first } = await auth.api.signUpEmail({
			body: {
				email: `${crypto.randomUUID()}@users.invalid`,
				password: 'a-long-enough-password',
				name: 'Owner',
				username: 'owner'
			} as never,
			headers: new Headers({ cookie: `hb_invite=${BOOTSTRAP}` })
		});
		const [row] = await empty.select().from(user).where(eq(user.id, first.id));
		expect(row.isAdmin).toBe(true);
		expect(await getJoinStatus(empty, BOOTSTRAP, NOW, BOOTSTRAP)).toBe('notFound');
	});
});

describe('validateInviteInput', () => {
	it('accepts whole numbers within the limits', () => {
		expect(validateInviteInput({ expiresInDays: '7', maxUses: '50' })).toEqual({
			ok: true,
			value: { expiresInDays: 7, maxUses: 50 }
		});
	});

	it('reports each field out of range', () => {
		expect(validateInviteInput({ expiresInDays: '31', maxUses: '1.5' })).toEqual({
			ok: false,
			errors: {
				expiresInDays: 'Choose between 1 and 30 days.',
				maxUses: 'Choose between 1 and 50 uses.'
			}
		});
		expect(validateInviteInput({ expiresInDays: '0', maxUses: '1' })).toEqual({
			ok: false,
			errors: { expiresInDays: 'Choose between 1 and 30 days.' }
		});
		expect(validateInviteInput({ expiresInDays: '1000', maxUses: '' })).toMatchObject({
			ok: false
		});
	});
});
