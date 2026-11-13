import { beforeEach, describe, expect, it } from 'vitest';
import { createInvite, deleteInvite } from '#lib/server/auth/invites.ts';
import type { Db } from '#lib/server/db/client.ts';
import { group, groupMember, invite, user } from '#lib/server/db/schema.ts';
import { createTestDb } from '#lib/server/db/test-db.ts';
import { eq } from 'drizzle-orm';
import {
	nextOwner,
	DEAD_LINK_MESSAGE,
	FULL_MESSAGE,
	MAX_MEMBERS,
	createGroup,
	getMembership,
	groupForInvite,
	joinGroup,
	leaveGroup,
	listGroups,
	listMembers,
	removeMember,
	resetInvite,
	updateGroup
} from './groups.ts';

let db: Db;
const now = new Date('2026-10-15T12:00:00Z');

async function makeUser(id: string = crypto.randomUUID()): Promise<string> {
	await db.insert(user).values({
		id,
		name: 'Someone',
		email: `${id}@users.invalid`,
		username: `u_${id.slice(0, 8)}`,
		displayUsername: `u_${id.slice(0, 8)}`,
		timezone: 'UTC',
		weekStartsOn: 'monday'
	});
	return id;
}

async function makeGroup(ownerId: string) {
	const result = await createGroup(db, ownerId, { name: 'Crew', icon: 'rocket' }, now);
	if (!result.ok) throw new Error(result.message);
	const membership = await getMembership(db, ownerId, result.groupId, now);
	return { groupId: result.groupId, code: membership!.inviteCode };
}

async function memberIds(groupId: string) {
	const rows = await db.select().from(groupMember).where(eq(groupMember.groupId, groupId));
	return rows;
}

beforeEach(async () => {
	db = await createTestDb();
});

describe('createGroup', () => {
	it('makes the creator owner, with one live invite and a trimmed name', async () => {
		const owner = await makeUser();
		const result = await createGroup(db, owner, { name: '  Crew  ', icon: 'rocket' }, now);
		if (!result.ok) throw new Error('expected ok');
		const membership = await getMembership(db, owner, result.groupId, now);
		expect(membership).toMatchObject({
			group: { id: result.groupId, name: 'Crew', icon: 'rocket' },
			role: 'owner'
		});
		const invites = await db.select().from(invite).where(eq(invite.groupId, result.groupId));
		expect(invites).toHaveLength(1);
		expect(invites[0].code).toBe(membership!.inviteCode);
		expect(invites[0].expiresAt > now).toBe(true);
	});

	it('refuses a bad name or icon with the field', async () => {
		const owner = await makeUser();
		const bad = async (name: string, icon: string) => {
			const r = await createGroup(db, owner, { name, icon }, now);
			return r.ok ? null : r.field;
		};
		expect(await bad('   ', 'rocket')).toBe('name');
		expect(await bad('x'.repeat(41), 'rocket')).toBe('name');
		expect(await bad('Crew', 'ab')).toBe('icon');
		expect(await bad('Crew', 'nope')).toBe('icon');
		expect(await bad('Crew', 'lock')).toBe('icon');
		expect(await bad('Crew', '🔥')).toBe('icon');
		expect(await db.select().from(group)).toHaveLength(0);
	});
});

describe('joinGroup', () => {
	it('adds a member by code, idempotently', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		expect(await joinGroup(db, friend, code, new Date(now.getTime() + 1000))).toEqual({
			ok: true,
			groupId
		});
		expect(await joinGroup(db, friend, code, now)).toEqual({ ok: true, groupId });
		expect(await memberIds(groupId)).toHaveLength(2);
		expect(await listGroups(db, friend)).toEqual([
			{ id: groupId, name: 'Crew', icon: 'rocket', memberCount: 2 }
		]);
		expect((await listMembers(db, groupId)).map((m) => m.role)).toEqual(['owner', 'member']);
	});

	it('refuses a link whose group is gone, without throwing', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await db.delete(group).where(eq(group.id, groupId));
		expect(await joinGroup(db, friend, code, now)).toEqual({
			ok: false,
			message: DEAD_LINK_MESSAGE
		});
	});

	it('refuses an admin invite and unknown codes', async () => {
		const owner = await makeUser();
		const { code } = await createInvite(
			db,
			{ createdBy: owner, expiresInDays: 1, maxUses: 5 },
			now
		);
		expect(await joinGroup(db, owner, code, now)).toEqual({
			ok: false,
			message: DEAD_LINK_MESSAGE
		});
		expect(await joinGroup(db, owner, 'nope', now)).toEqual({
			ok: false,
			message: DEAD_LINK_MESSAGE
		});
		expect(await groupForInvite(db, code, now)).toBeNull();
		expect(await groupForInvite(db, 'nope', now)).toBeNull();
	});

	it('stops at the cap even with simultaneous joins', async () => {
		const owner = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		for (let i = 0; i < MAX_MEMBERS - 2; i++) {
			await joinGroup(db, await makeUser(), code, now);
		}
		expect(await memberIds(groupId)).toHaveLength(49);
		const [a, b] = [await makeUser(), await makeUser()];
		const results = await Promise.all([joinGroup(db, a, code, now), joinGroup(db, b, code, now)]);
		expect(await memberIds(groupId)).toHaveLength(MAX_MEMBERS);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results).toContainEqual({ ok: false, message: FULL_MESSAGE });
		expect((await groupForInvite(db, code, now)) as { memberCount: number }).toMatchObject({
			memberCount: MAX_MEMBERS
		});
	});
});

describe('leaveGroup', () => {
	it('lets a member leave', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, friend, code, now);
		expect(await leaveGroup(db, friend, groupId, now)).toBe('left');
		expect(await getMembership(db, friend, groupId, now)).toBeNull();
		expect(await leaveGroup(db, friend, groupId, now)).toBeNull();
	});

	it('promotes the earliest-joined member when the owner leaves', async () => {
		const owner = await makeUser();
		const first = await makeUser();
		const second = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, first, code, new Date(now.getTime() + 1000));
		await joinGroup(db, second, code, new Date(now.getTime() + 2000));
		expect(await leaveGroup(db, owner, groupId, now)).toBe('left');
		expect((await getMembership(db, first, groupId, now))?.role).toBe('owner');
		expect((await getMembership(db, second, groupId, now))?.role).toBe('member');
	});

	it('breaks a same-instant tie by lowest userId', async () => {
		const owner = await makeUser('owner');
		const { groupId } = await makeGroup(owner);
		const [low, high] = [await makeUser('aaa'), await makeUser('zzz')];
		const joinedAt = new Date(now.getTime() + 5000);
		await db.insert(groupMember).values([
			{ groupId, userId: high, role: 'member', joinedAt },
			{ groupId, userId: low, role: 'member', joinedAt }
		]);
		await leaveGroup(db, owner, groupId, now);
		expect((await getMembership(db, low, groupId, now))?.role).toBe('owner');
		expect((await getMembership(db, high, groupId, now))?.role).toBe('member');
	});

	it('deletes the group and kills its invite when the last member leaves', async () => {
		const owner = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		expect(await leaveGroup(db, owner, groupId, now)).toBe('deleted');
		expect(await db.select().from(group)).toHaveLength(0);
		expect(await groupForInvite(db, code, now)).toBe('dead');
	});
});

describe('removeMember', () => {
	it('lets the owner remove a member, who then has no membership', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, friend, code, now);
		expect(await removeMember(db, owner, groupId, friend)).toBe(true);
		expect(await getMembership(db, friend, groupId, now)).toBeNull();
	});

	it('refuses a member, the owner removing themselves, and strangers', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const other = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, friend, code, now);
		await joinGroup(db, other, code, now);
		expect(await removeMember(db, friend, groupId, other)).toBe(false);
		expect(await removeMember(db, owner, groupId, owner)).toBe(false);
		expect(await removeMember(db, owner, groupId, await makeUser())).toBe(false);
		expect(await memberIds(groupId)).toHaveLength(3);
	});
});

describe('resetInvite', () => {
	it('is owner only; the new code works and the old one is dead', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const late = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, friend, code, now);
		expect(await resetInvite(db, friend, groupId, now)).toBeNull();
		const fresh = await resetInvite(db, owner, groupId, now);
		expect(fresh).toEqual(expect.any(String));
		expect((await getMembership(db, owner, groupId, now))?.inviteCode).toBe(fresh);
		expect(await joinGroup(db, late, code, now)).toEqual({ ok: false, message: DEAD_LINK_MESSAGE });
		expect(await groupForInvite(db, code, now)).toBe('dead');
		expect(await joinGroup(db, late, fresh!, now)).toEqual({ ok: true, groupId });
	});
});

describe('deleting a group link', () => {
	it('keeps members and clears the link until reset', async () => {
		const owner = await makeUser();
		const friend = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		await joinGroup(db, friend, code, now);
		expect(await deleteInvite(db, code, now)).toBe(true);
		expect(await listMembers(db, groupId)).toHaveLength(2);
		expect((await getMembership(db, owner, groupId, now))?.inviteCode).toBe('');
		expect(await groupForInvite(db, code, now)).toBe('dead');
		const fresh = await resetInvite(db, owner, groupId, now);
		expect((await getMembership(db, owner, groupId, now))?.inviteCode).toBe(fresh);
	});
});

describe('getMembership', () => {
	it('is null for a stranger', async () => {
		const owner = await makeUser();
		const { groupId } = await makeGroup(owner);
		expect(await getMembership(db, await makeUser(), groupId, now)).toBeNull();
	});
});

describe('updateGroup', () => {
	it('lets the owner rename the group and change its icon', async () => {
		const owner = await makeUser();
		const { groupId } = await makeGroup(owner);
		expect(
			await updateGroup(db, owner, groupId, { name: '  Climbers ', icon: 'mountains' })
		).toEqual({
			ok: true
		});
		const membership = await getMembership(db, owner, groupId, now);
		expect(membership?.group).toMatchObject({ name: 'Climbers', icon: 'mountains' });
	});

	it('is null for a member or a stranger, and changes nothing', async () => {
		const owner = await makeUser();
		const { groupId, code } = await makeGroup(owner);
		const member = await makeUser();
		await joinGroup(db, member, code, now);
		const stranger = await makeUser();
		for (const who of [member, stranger]) {
			expect(await updateGroup(db, who, groupId, { name: 'Mine', icon: 'rocket' })).toBeNull();
		}
		expect((await getMembership(db, owner, groupId, now))?.group.name).toBe('Crew');
	});

	it('refuses a bad name or icon', async () => {
		const owner = await makeUser();
		const { groupId } = await makeGroup(owner);
		expect(await updateGroup(db, owner, groupId, { name: ' ', icon: 'rocket' })).toEqual({
			ok: false,
			field: 'name',
			message: 'Name must be 1 to 40 characters.'
		});
		expect(
			await updateGroup(db, owner, groupId, { name: 'x'.repeat(41), icon: 'rocket' })
		).toMatchObject({
			field: 'name'
		});
		expect(await updateGroup(db, owner, groupId, { name: 'Crew', icon: 'not-an-icon' })).toEqual({
			ok: false,
			field: 'icon',
			message: 'Pick an icon.'
		});
	});
});

describe('nextOwner', () => {
	it('is the first other member by join order', () => {
		const members = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }];
		expect(nextOwner(members, 'a')).toEqual({ userId: 'b' });
		expect(nextOwner(members, 'b')).toEqual({ userId: 'a' });
		expect(nextOwner([{ userId: 'a' }], 'a')).toBeUndefined();
	});
});
