import { and, eq, inArray } from 'drizzle-orm';
import { monthName, monthOf } from '#lib/game/calendar.ts';
import { rankRows } from '#lib/game/leaderboard.ts';
import type { CardScore } from '#lib/game/score.ts';
import { cardView, type ViewSquare } from '#lib/server/card-view.ts';
import { getCard } from '#lib/server/cards.ts';
import { localDate } from '#lib/server/clock.ts';
import type { Db } from '#lib/server/db/client.ts';
import { habit } from '#lib/server/db/schema.ts';
import { getMembership, listMembers } from '#lib/server/groups.ts';

export type BoardRow = {
	userId: string;
	displayUsername: string;
	avatarIcon: string;
	/** % complete on this month's card; null without a card. */
	percent: number | null;
	lines: number | null;
	rank: number | null;
	isViewer: boolean;
};

type Member = Awaited<ReturnType<typeof listMembers>>[number];

const todayOf = (member: Member, now: Date) => localDate(now, member.timezone ?? 'UTC');

/**
 * The group's leaderboard for this month, as the viewer sees it. Each member is scored on their own
 * local date (spec: % complete, then lines, then name).
 */
export async function groupBoard(
	db: Db,
	viewerId: string,
	groupId: string,
	now: Date
): Promise<{ rows: BoardRow[] } | null> {
	if (!(await getMembership(db, viewerId, groupId, now))) return null;
	const members = await listMembers(db, groupId);
	if (!members.some((m) => m.userId === viewerId)) return null;
	const rows = await Promise.all(
		members.map(async (m) => {
			const today = todayOf(m, now);
			const card = await getCard(db, m.userId, monthOf(today));
			const score = card ? (await cardView(db, m.userId, card, today)).score : null;
			return {
				userId: m.userId,
				displayUsername: m.displayUsername ?? 'Someone',
				avatarIcon: m.avatarIcon,
				percent: score?.percent ?? null,
				lines: score ? score.lines.length : null,
				isViewer: m.userId === viewerId
			};
		})
	);
	return { rows: rankRows(rows) };
}

/** A member's current card for the viewer: private habits show as a lock icon, no ids, links or rewards. */
export async function memberCard(
	db: Db,
	viewerId: string,
	groupId: string,
	memberId: string,
	now: Date
): Promise<{
	member: { displayUsername: string; avatarIcon: string };
	monthName: string;
	card: { size: number; squares: ViewSquare[]; score: CardScore } | null;
} | null> {
	if (!(await getMembership(db, viewerId, groupId, now))) return null;
	const member = (await listMembers(db, groupId)).find((m) => m.userId === memberId);
	if (!member) return null;
	const today = todayOf(member, now);
	const month = monthOf(today);
	const card = await getCard(db, memberId, month);
	let shown = null;
	if (card) {
		const view = await cardView(db, memberId, card, today);
		// Private at card start, or made private since.
		const habitIds = card.squares.flatMap((s) => (!s.isCenter && s.habitId ? [s.habitId] : []));
		const nowPrivate = new Set(
			(
				await db
					.select({ id: habit.id })
					.from(habit)
					.where(and(inArray(habit.id, habitIds), eq(habit.isPrivate, true)))
			).map((h) => h.id)
		);
		const privateIds = new Set(
			card.squares
				.filter(
					(s) => !s.isCenter && (s.isPrivate || (s.habitId !== null && nowPrivate.has(s.habitId)))
				)
				.map((s) => s.id)
		);
		const squares = view.squares.map((square) => {
			const { id, link, ...rest } = square;
			void link;
			return id && privateIds.has(id) ? { ...rest, icon: 'lock' as const, name: 'Private' } : rest;
		});
		shown = { size: card.size, squares, score: view.score };
	}
	return {
		member: {
			displayUsername: member.displayUsername ?? 'Someone',
			avatarIcon: member.avatarIcon
		},
		monthName: monthName(month),
		card: shown
	};
}
