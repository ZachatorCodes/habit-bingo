// Group feed (spec M9 §3): highlights from members' cards, plus one reaction per person per item.
import { sql } from 'drizzle-orm';
import {
	check,
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
import { REACTIONS } from '#lib/game/feed.ts';
import type { FeedEventType } from '#lib/game/types.ts';
import { user } from './auth.ts';
import { card } from './cards.ts';

export const feedEvent = pgTable(
	'feed_event',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		cardId: text('card_id')
			.notNull()
			.references(() => card.id, { onDelete: 'cascade' }),
		type: text('type').$type<FeedEventType>().notNull(),
		/** `card`, `square:<squareId>`, `tier:<tier>` or `checkin:<squareId>:<date>`; one per key per card. */
		key: text('key').notNull(),
		/**
		 * Snapshot at posting time: `{ month }`, `{ name, icon }`, `{ private: true }` or `{}`; a
		 * check-in adds `{ date, count, backfilled }` and is rewritten as its count changes.
		 */
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		unique('feed_event_card_id_key_unique').on(table.cardId, table.key),
		index('feed_event_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
		check(
			'feed_event_type_check',
			sql`${table.type} in ('cardStarted', 'squareComplete', 'bingo', 'sixtyPercent', 'blackout', 'checkIn')`
		)
	]
);

export const reaction = pgTable(
	'reaction',
	{
		feedEventId: text('feed_event_id')
			.notNull()
			.references(() => feedEvent.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		icon: text('icon').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.feedEventId, table.userId] }),
		check(
			'reaction_icon_check',
			sql.raw(`"reaction"."icon" in (${REACTIONS.map((r) => `'${r}'`).join(', ')})`)
		)
	]
);
