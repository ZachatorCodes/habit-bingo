import { monthName, nextMonth } from '#lib/game/calendar.ts';
import { evaluateSquare } from '#lib/game/evaluate.ts';
import { centerState, nextMonthOpens } from '#lib/game/next-month.ts';
import { counts, scoreCard, squareCompletion, type CardScore } from '#lib/game/score.ts';
import type { SquareState } from '#lib/game/square-state.ts';
import type { HighlightState } from '#lib/game/feed.ts';
import { getCard, getCardById, type Card } from '#lib/server/cards.ts';
import { getCheckIns } from '#lib/server/check-ins.ts';
import type { Db } from '#lib/server/db/client.ts';
import { card as cardTable } from '#lib/server/db/schema.ts';
import { eq } from 'drizzle-orm';
import type { IconName } from '#lib/icons.ts';

export type ViewSquare = {
	/** Habit squares only: links to the habit sheet. */
	id?: string;
	icon: IconName;
	name: string;
	state: SquareState;
	progress?: number;
	/** The center square, which leads to next month's card. */
	link?: boolean;
	/** How much of its whole-month job is done, 0 to 1 (the center: 0). */
	completion: number;
	/** Counts toward lines, tiers and blackout now (see `evaluateSquare`). */
	counting: boolean;
};

/**
 * A card as of `today`: every square's live state and completion (the center by spec §3.5) and the
 * card's score (§3.6–§3.7). Shared by the card and Today, which passes the check-ins it already has.
 */
export async function cardView(
	db: Db,
	userId: string,
	card: Card,
	today: string,
	known?: Awaited<ReturnType<typeof getCheckIns>>
): Promise<{ squares: ViewSquare[]; score: CardScore; nextMonthName: string }> {
	const next = monthName(nextMonth(card.month));
	const [nextCard, checkIns] = await Promise.all([
		getCard(db, userId, nextMonth(card.month)),
		known ?? getCheckIns(db, card.id)
	]);
	// The center square: free until the last 7 days, then it leads to next month's card.
	// Only a next card built by the 3rd completes the center (spec §3.5): one built later starts later.
	const builtInTime = nextCard !== null && nextCard.startDate <= `${nextMonth(card.month)}-03`;
	const state = centerState(card.month, today, builtInTime);
	const center: ViewSquare =
		today < nextMonthOpens(card.month)
			? { icon: 'star', name: 'Free', state: 'free', completion: 0, counting: true }
			: {
					icon: 'rocket',
					name: state === 'buildNext' ? `Build ${next}'s card` : `${next} ready`,
					state,
					link: true,
					completion: 0,
					counting: counts(state)
				};
	const squares = card.squares.map((square): ViewSquare => {
		if (square.isCenter) return center;
		const counts = checkIns.get(square.id) ?? new Map<string, number>();
		const evaluation = evaluateSquare(square, card, counts, today);
		return {
			id: square.id,
			icon: square.icon,
			name: square.name,
			...evaluation,
			completion: squareCompletion(square, card, counts, today, evaluation.state)
		};
	});
	return { squares, score: scoreCard(card.size, squares), nextMonthName: next };
}

/**
 * What the feed compares around a check-in: each square's state and the reached tiers, from the
 * same per-square evaluation as `cardView`. `squares` carries what a posted highlight names.
 */
export async function highlightState(
	db: Db,
	cardId: string,
	today: string,
	counts?: Awaited<ReturnType<typeof getCheckIns>>
): Promise<{
	state: HighlightState;
	squares: { id: string; name: string; icon: IconName; isPrivate: boolean }[];
}> {
	const [{ userId }] = await db
		.select({ userId: cardTable.userId })
		.from(cardTable)
		.where(eq(cardTable.id, cardId));
	const card = (await getCardById(db, userId, cardId))!;
	const view = await cardView(db, userId, card, today, counts);
	const habits = card.squares.flatMap((s) => (s.isCenter ? [] : [s]));
	return {
		state: {
			squares: habits.map((s) => ({
				id: s.id,
				direction: s.direction,
				state: view.squares[card.squares.indexOf(s)].state
			})),
			tiers: view.score.tiers
		},
		squares: habits
	};
}
