import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { REACTIONS, type highlightChanges, type ReactionIcon } from '#lib/game/feed.ts';
import { CARD_SIZES, type CardSize } from '#lib/game/card-layout.ts';
import type { Db } from '#lib/server/db/client.ts';
import { feedEvent, groupMember, reaction, user } from '#lib/server/db/schema.ts';
import type { FeedEventType } from '#lib/server/db/schema/feed.ts';

export const FEED_PAGE = 30;

export type FeedItem = {
	id: string;
	type: FeedEventType;
	payload: Record<string, unknown>;
	createdAt: Date;
	author: { userId: string; displayUsername: string | null; avatarIcon: string };
	reactions: Record<ReactionIcon, number>;
	mine: ReactionIcon | null;
};

const isReaction = (icon: string): icon is ReactionIcon =>
	(REACTIONS as readonly string[]).includes(icon);

const typeOf = (key: string): FeedEventType =>
	key === 'card'
		? 'cardStarted'
		: key.startsWith('square:')
			? 'squareComplete'
			: (key.slice('tier:'.length) as FeedEventType);

export async function postCardStarted(
	tx: Db,
	card: { id: string; userId: string; month: string }
): Promise<void> {
	await tx
		.insert(feedEvent)
		.values({
			id: crypto.randomUUID(),
			userId: card.userId,
			cardId: card.id,
			type: 'cardStarted',
			key: 'card',
			payload: { month: card.month },
			createdAt: new Date()
		})
		.onConflictDoNothing();
}

/** Applies `highlightChanges` output: inserts are idempotent, removals take reactions with them. */
export async function syncHighlights(
	tx: Db,
	card: { id: string; userId: string; size: CardSize },
	squares: { id: string; name: string | null; icon: string | null; isPrivate: boolean | null }[],
	changes: ReturnType<typeof highlightChanges>
): Promise<void> {
	if (changes.remove.length) {
		await tx
			.delete(feedEvent)
			.where(and(eq(feedEvent.cardId, card.id), inArray(feedEvent.key, changes.remove)));
	}
	const now = new Date();
	for (const key of changes.post) {
		const square = squares.find((s) => `square:${s.id}` === key);
		await tx
			.insert(feedEvent)
			.values({
				id: crypto.randomUUID(),
				userId: card.userId,
				cardId: card.id,
				type: typeOf(key),
				key,
				payload: !square
					? key === 'tier:sixtyPercent'
						? { squares: CARD_SIZES[card.size].sixtyThreshold }
						: {}
					: square.isPrivate
						? { private: true }
						: { name: square.name, icon: square.icon },
				createdAt: now
			})
			.onConflictDoNothing();
	}
}

/**
 * The day's check-in item for one square: one per square and date, with the day's count. A higher
 * count moves it to the top; a lower one keeps its place; 0 removes it with its reactions.
 */
export async function syncCheckIn(
	tx: Db,
	card: { id: string; userId: string },
	square: { id: string; name: string | null; icon: string | null; isPrivate: boolean | null },
	date: string,
	count: number,
	today: string,
	now: Date
): Promise<void> {
	const key = `checkin:${square.id}:${date}`;
	if (count === 0) {
		await tx.delete(feedEvent).where(and(eq(feedEvent.cardId, card.id), eq(feedEvent.key, key)));
		return;
	}
	const day = { date, count, backfilled: date !== today };
	await tx
		.insert(feedEvent)
		.values({
			id: crypto.randomUUID(),
			userId: card.userId,
			cardId: card.id,
			type: 'checkIn',
			key,
			payload: square.isPrivate
				? { private: true, ...day }
				: { name: square.name, icon: square.icon, ...day },
			createdAt: now
		})
		.onConflictDoUpdate({
			target: [feedEvent.cardId, feedEvent.key],
			set: {
				payload: sql`excluded.payload`,
				createdAt: sql`case when (excluded.payload->>'count')::int > (${feedEvent.payload}->>'count')::int then excluded.created_at else ${feedEvent.createdAt} end`
			}
		});
}

/** Up to 30 events from the group's current members, newest first; null when not a member. */
export async function groupFeed(
	db: Db,
	viewerId: string,
	groupId: string,
	before?: string
): Promise<{ items: FeedItem[]; olderCursor: string | null } | null> {
	const [member] = await db
		.select({ userId: groupMember.userId })
		.from(groupMember)
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, viewerId)));
	if (!member) return null;

	// Cursor is `<ISO createdAt>|<id>`; a malformed one is ignored (first page).
	const [at, id] = before?.split('|') ?? [];
	const cursor = at && id && !Number.isNaN(Date.parse(at)) ? { at: new Date(at), id } : null;
	const rows = await db
		.select({
			id: feedEvent.id,
			type: feedEvent.type,
			payload: feedEvent.payload,
			createdAt: feedEvent.createdAt,
			userId: user.id,
			displayUsername: user.displayUsername,
			avatarIcon: user.avatarIcon
		})
		.from(feedEvent)
		.innerJoin(groupMember, eq(groupMember.userId, feedEvent.userId))
		.innerJoin(user, eq(user.id, feedEvent.userId))
		.where(
			and(
				eq(groupMember.groupId, groupId),
				cursor
					? or(
							lt(feedEvent.createdAt, cursor.at),
							and(eq(feedEvent.createdAt, cursor.at), lt(feedEvent.id, cursor.id))
						)
					: undefined
			)
		)
		.orderBy(desc(feedEvent.createdAt), desc(feedEvent.id))
		.limit(FEED_PAGE + 1);

	const page = rows.slice(0, FEED_PAGE);
	const marks = page.length
		? await db
				.select({
					feedEventId: reaction.feedEventId,
					userId: reaction.userId,
					icon: reaction.icon
				})
				.from(reaction)
				.where(
					inArray(
						reaction.feedEventId,
						page.map((r) => r.id)
					)
				)
		: [];
	const items = page.map((r): FeedItem => {
		const counts = Object.fromEntries(REACTIONS.map((i) => [i, 0])) as Record<ReactionIcon, number>;
		let mine: ReactionIcon | null = null;
		for (const m of marks) {
			if (m.feedEventId !== r.id || !isReaction(m.icon)) continue;
			counts[m.icon]++;
			if (m.userId === viewerId) mine = m.icon;
		}
		return {
			id: r.id,
			type: r.type,
			payload: r.payload,
			createdAt: r.createdAt,
			author: { userId: r.userId, displayUsername: r.displayUsername, avatarIcon: r.avatarIcon },
			reactions: counts,
			mine
		};
	});
	const last = page.at(-1);
	return {
		items,
		olderCursor:
			rows.length > FEED_PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null
	};
}

/** Add, switch or toggle off the viewer's reaction. They must share a group with the author. */
export async function react(
	db: Db,
	userId: string,
	feedEventId: string,
	icon: string
): Promise<'added' | 'switched' | 'removed' | 'notFound' | 'badIcon'> {
	if (!isReaction(icon)) return 'badIcon';
	const shared = await db
		.select({ one: sql`1` })
		.from(feedEvent)
		.innerJoin(groupMember, eq(groupMember.userId, feedEvent.userId))
		.where(
			and(
				eq(feedEvent.id, feedEventId),
				inArray(
					groupMember.groupId,
					db
						.select({ groupId: groupMember.groupId })
						.from(groupMember)
						.where(eq(groupMember.userId, userId))
				)
			)
		)
		.limit(1);
	if (!shared.length) return 'notFound';

	const mine = and(eq(reaction.feedEventId, feedEventId), eq(reaction.userId, userId));
	return db.transaction(async (tx) => {
		const [existing] = await tx.select({ icon: reaction.icon }).from(reaction).where(mine);
		if (!existing) {
			await tx
				.insert(reaction)
				.values({ feedEventId, userId, icon })
				.onConflictDoUpdate({ target: [reaction.feedEventId, reaction.userId], set: { icon } });
			return 'added';
		}
		if (existing.icon === icon) {
			await tx.delete(reaction).where(mine);
			return 'removed';
		}
		await tx.update(reaction).set({ icon }).where(mine);
		return 'switched';
	});
}
