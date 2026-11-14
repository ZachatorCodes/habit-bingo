import { and, asc, count, desc, eq, gt, sql } from 'drizzle-orm';
import { isPickableIcon } from '#lib/game/icons.ts';
import { createInvite, getInviteStatus } from '#lib/server/auth/invites.ts';
import type { Db } from '#lib/server/db/client.ts';
import { group, groupMember, invite, user } from '#lib/server/db/schema.ts';

export const MAX_MEMBERS = 50;
export const DEAD_LINK_MESSAGE = 'This invite link no longer works.';
export const FULL_MESSAGE = 'This group is full.';

type GroupSummary = { id: string; name: string; icon: string };

const lockGroup = (tx: Db, groupId: string) =>
	tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'group:' + groupId}))`);

/** A group's link never runs out in practice: 100 years, a million uses. */
const standingInvite = (db: Db, createdBy: string, groupId: string, now: Date) =>
	createInvite(db, { createdBy, groupId, expiresInDays: 36500, maxUses: 1_000_000 }, now);

type GroupInput = { name: string; icon: string };
type GroupProblem = { ok: false; field: 'name' | 'icon'; message: string };

/** The trimmed name, or what is wrong with the input. */
function checkGroup(input: GroupInput): { ok: true; name: string } | GroupProblem {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 40) {
		return { ok: false, field: 'name', message: 'Name must be 1 to 40 characters.' };
	}
	if (!isPickableIcon(input.icon)) {
		return { ok: false, field: 'icon', message: 'Pick an icon.' };
	}
	return { ok: true, name };
}

export async function createGroup(
	db: Db,
	userId: string,
	input: GroupInput,
	now: Date
): Promise<{ ok: true; groupId: string } | GroupProblem> {
	const checked = checkGroup(input);
	if (!checked.ok) return checked;
	const name = checked.name;
	const groupId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(group).values({ id: groupId, name, icon: input.icon, createdBy: userId });
		await tx.insert(groupMember).values({ groupId, userId, role: 'owner', joinedAt: now });
		await standingInvite(tx, userId, groupId, now);
	});
	return { ok: true, groupId };
}

/** Renames a group and changes its icon; owner only (null for anyone else). */
export async function updateGroup(
	db: Db,
	userId: string,
	groupId: string,
	input: GroupInput
): Promise<{ ok: true } | GroupProblem | null> {
	const [owner] = await db
		.select({ role: groupMember.role })
		.from(groupMember)
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
	if (owner?.role !== 'owner') return null;
	const checked = checkGroup(input);
	if (!checked.ok) return checked;
	await db.update(group).set({ name: checked.name, icon: input.icon }).where(eq(group.id, groupId));
	return { ok: true };
}

export async function listGroups(
	db: Db,
	userId: string
): Promise<(GroupSummary & { memberCount: number })[]> {
	const mine = db
		.select({ groupId: groupMember.groupId })
		.from(groupMember)
		.where(eq(groupMember.userId, userId));
	const rows = await db
		.select({ id: group.id, name: group.name, icon: group.icon, memberCount: count() })
		.from(group)
		.innerJoin(groupMember, eq(groupMember.groupId, group.id))
		.where(sql`${group.id} in (${mine})`)
		.groupBy(group.id)
		.orderBy(asc(group.name), asc(group.id));
	return rows;
}

export async function getMembership(
	db: Db,
	userId: string,
	groupId: string,
	now: Date
): Promise<{ group: GroupSummary; role: 'owner' | 'member'; inviteCode: string } | null> {
	const [row] = await db
		.select({ id: group.id, name: group.name, icon: group.icon, role: groupMember.role })
		.from(groupMember)
		.innerJoin(group, eq(group.id, groupMember.groupId))
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
	if (!row) return null;
	// The live link is the one expiring last; reset expires the older ones. None when deleted.
	const [link] = await db
		.select({ code: invite.code })
		.from(invite)
		.where(and(eq(invite.groupId, groupId), gt(invite.expiresAt, now)))
		.orderBy(desc(invite.expiresAt))
		.limit(1);
	return {
		group: { id: row.id, name: row.name, icon: row.icon },
		role: row.role,
		inviteCode: link?.code ?? ''
	};
}

export async function listMembers(db: Db, groupId: string) {
	return db
		.select({
			userId: groupMember.userId,
			displayUsername: user.displayUsername,
			avatarIcon: user.avatarIcon,
			timezone: user.timezone,
			role: groupMember.role,
			joinedAt: groupMember.joinedAt
		})
		.from(groupMember)
		.innerJoin(user, eq(user.id, groupMember.userId))
		.where(eq(groupMember.groupId, groupId))
		.orderBy(asc(groupMember.joinedAt), asc(groupMember.userId));
}

async function inviteGroupId(db: Db, code: string) {
	const [row] = await db
		.select({ groupId: invite.groupId })
		.from(invite)
		.where(eq(invite.code, code));
	return row?.groupId ?? null;
}

async function memberCount(db: Db, groupId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(groupMember)
		.where(eq(groupMember.groupId, groupId));
	return row.n;
}

export async function groupForInvite(
	db: Db,
	code: string,
	now: Date
): Promise<{ group: GroupSummary; memberCount: number } | 'dead' | null> {
	const groupId = await inviteGroupId(db, code);
	if (!groupId) return null;
	if ((await getInviteStatus(db, code, now)) !== 'valid') return 'dead';
	const [found] = await db
		.select({ id: group.id, name: group.name, icon: group.icon })
		.from(group)
		.where(eq(group.id, groupId));
	if (!found) return 'dead';
	return { group: found, memberCount: await memberCount(db, groupId) };
}

export async function joinGroup(
	db: Db,
	userId: string,
	code: string,
	now: Date
): Promise<{ ok: true; groupId: string } | { ok: false; message: string }> {
	const dead = { ok: false as const, message: DEAD_LINK_MESSAGE };
	const groupId = await inviteGroupId(db, code);
	if (!groupId) return dead;
	return db.transaction(async (tx) => {
		await lockGroup(tx, groupId);
		// Re-checked under the lock: a racing last-leave may have deleted the group.
		const found = await groupForInvite(tx, code, now);
		if (!found || found === 'dead') return dead;
		const [already] = await tx
			.select({ userId: groupMember.userId })
			.from(groupMember)
			.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
		if (already) return { ok: true as const, groupId };
		if ((await memberCount(tx, groupId)) >= MAX_MEMBERS) {
			return { ok: false as const, message: FULL_MESSAGE };
		}
		await tx.insert(groupMember).values({ groupId, userId, role: 'member', joinedAt: now });
		return { ok: true as const, groupId };
	});
}

export async function leaveGroup(
	db: Db,
	userId: string,
	groupId: string,
	now: Date
): Promise<'left' | 'deleted' | null> {
	return db.transaction(async (tx) => {
		await lockGroup(tx, groupId);
		const members = await tx
			.select({ userId: groupMember.userId, role: groupMember.role })
			.from(groupMember)
			.where(eq(groupMember.groupId, groupId))
			.orderBy(asc(groupMember.joinedAt), asc(groupMember.userId));
		const me = members.find((m) => m.userId === userId);
		if (!me) return null;
		if (members.length === 1) {
			await tx.update(invite).set({ expiresAt: now }).where(eq(invite.groupId, groupId));
			await tx.delete(group).where(eq(group.id, groupId)); // members cascade
			return 'deleted';
		}
		await tx
			.delete(groupMember)
			.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
		if (me.role === 'owner') {
			const heir = nextOwner(members, userId)!;
			await tx
				.update(groupMember)
				.set({ role: 'owner' })
				.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, heir.userId)));
		}
		return 'left';
	});
}

export async function removeMember(
	db: Db,
	ownerId: string,
	groupId: string,
	memberId: string
): Promise<boolean> {
	if (ownerId === memberId) return false;
	return db.transaction(async (tx) => {
		await lockGroup(tx, groupId);
		const [owner] = await tx
			.select({ userId: groupMember.userId })
			.from(groupMember)
			.where(
				and(
					eq(groupMember.groupId, groupId),
					eq(groupMember.userId, ownerId),
					eq(groupMember.role, 'owner')
				)
			);
		if (!owner) return false;
		const removed = await tx
			.delete(groupMember)
			.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, memberId)))
			.returning({ userId: groupMember.userId });
		return removed.length === 1;
	});
}

export async function resetInvite(
	db: Db,
	ownerId: string,
	groupId: string,
	now: Date
): Promise<string | null> {
	return db.transaction(async (tx) => {
		await lockGroup(tx, groupId);
		const [owner] = await tx
			.select({ userId: groupMember.userId })
			.from(groupMember)
			.where(
				and(
					eq(groupMember.groupId, groupId),
					eq(groupMember.userId, ownerId),
					eq(groupMember.role, 'owner')
				)
			);
		if (!owner) return null;
		await tx
			.update(invite)
			.set({ expiresAt: now })
			.where(and(eq(invite.groupId, groupId), gt(invite.expiresAt, now)));
		return (await standingInvite(tx, ownerId, groupId, now)).code;
	});
}

/** Who inherits a group when `userId` leaves it: the first other member, by join order. */
export function nextOwner<M extends { userId: string }>(
	members: readonly M[],
	userId: string
): M | undefined {
	return members.find((m) => m.userId !== userId);
}
