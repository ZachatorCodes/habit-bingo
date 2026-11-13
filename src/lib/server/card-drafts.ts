// Card-builder progress, saved after every step so closing the tab loses nothing. One draft per
// person; a draft from another month is forgotten, since the month decides which card it builds.
import { and, eq, lt } from 'drizzle-orm';
import * as z from 'zod';
import { STEPS, emptyDraft, stepsFor, type CardDraft } from '#lib/game/card-draft.ts';
import type { Card } from '#lib/server/cards.ts';
import type { Db } from '#lib/server/db/client.ts';
import { cardDraft } from '#lib/server/db/schema.ts';

const draftSchema = z.object({
	month: z.string(),
	cardId: z.string().nullable(),
	size: z.union([z.literal(3), z.literal(5)]).nullable(),
	habitIds: z.array(z.string()),
	targets: z.record(z.string(), z.number()),
	rewards: z.object({ bingo: z.string(), sixty: z.string(), blackout: z.string() }),
	layout: z.array(z.string().nullable()).nullable(),
	completed: z.array(z.enum(STEPS))
});

/**
 * The draft for `month`. Drafts for months before `currentMonth` (the person's own month; the
 * target month unless building next month's card) are forgotten.
 */
export async function getDraft(
	db: Db,
	userId: string,
	month: string,
	currentMonth = month
): Promise<CardDraft> {
	await db
		.delete(cardDraft)
		.where(and(eq(cardDraft.userId, userId), lt(cardDraft.month, currentMonth)));
	const [row] = await db
		.select()
		.from(cardDraft)
		.where(and(eq(cardDraft.userId, userId), eq(cardDraft.month, month)));
	if (!row) return emptyDraft(month);
	const parsed = draftSchema.safeParse(row.data);
	if (parsed.success && parsed.data.month === month) return parsed.data;
	await discardDraft(db, userId, month);
	return emptyDraft(month);
}

export async function saveDraft(db: Db, userId: string, draft: CardDraft): Promise<void> {
	const values = { month: draft.month, data: draft, updatedAt: new Date() };
	await db
		.insert(cardDraft)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: [cardDraft.userId, cardDraft.month], set: values });
}

export async function discardDraft(db: Db, userId: string, month: string): Promise<void> {
	await db.delete(cardDraft).where(and(eq(cardDraft.userId, userId), eq(cardDraft.month, month)));
}

/**
 * An editing draft that holds a started card as it is, every step done. Every habit's target is
 * carried as an override, because updateCard keeps a kept habit's stored target unless told
 * otherwise: the Targets step then shows the card's targets rather than freshly prorated ones.
 */
export function draftFromCard(card: Card): CardDraft {
	const habitSquares = card.squares.flatMap((s) => (!s.isCenter && s.habitId ? [s] : []));
	const hasGap = card.squares.some((s) => !s.isCenter && !s.habitId);
	const draft: CardDraft = {
		month: card.month,
		cardId: card.id,
		size: card.size,
		habitIds: habitSquares.map((s) => s.habitId!),
		targets: Object.fromEntries(habitSquares.map((s) => [s.habitId!, s.target])),
		rewards: { ...card.rewards },
		// A square whose habit is gone cannot be placed again; the Board step then makes a new layout.
		layout: hasGap ? null : card.squares.map((s) => (s.isCenter ? null : s.habitId)),
		completed: []
	};
	return { ...draft, completed: stepsFor(draft) };
}
