// A person's monthly card (spec §5.3). Squares snapshot their habit, so library edits never change
// a card; `habit_id` only remembers where a square came from.
import { sql } from 'drizzle-orm';
import type { Tier } from '#lib/game/score.ts';
import {
	boolean,
	check,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';
import { habit } from './habits.ts';

export const card = pgTable(
	'card',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** YYYY-MM, in the person's time zone. */
		month: text('month').notNull(),
		size: integer('size').notNull(),
		/** YYYY-MM-DD; the first day that counts. */
		startDate: text('start_date').notNull(),
		editableUntil: timestamp('editable_until', { withTimezone: true }).notNull(),
		weekStartsOn: text('week_starts_on').notNull(),
		rewardBingo: text('reward_bingo').notNull(),
		rewardSixty: text('reward_sixty').notNull(),
		rewardBlackout: text('reward_blackout').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		unique('card_user_id_month_unique').on(table.userId, table.month),
		check('card_size_check', sql`${table.size} in (3, 5)`),
		check('card_week_starts_on_check', sql`${table.weekStartsOn} in ('monday', 'sunday')`)
	]
);

export const cardSquare = pgTable(
	'card_square',
	{
		id: text('id').primaryKey(),
		cardId: text('card_id')
			.notNull()
			.references(() => card.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		isCenter: boolean('is_center').notNull().default(false),
		habitId: text('habit_id').references(() => habit.id, { onDelete: 'set null' }),
		// Snapshot of the habit; all null on the FREE square.
		emoji: text('emoji'),
		icon: text('icon'),
		name: text('name'),
		category: text('category'),
		direction: text('direction'),
		period: text('period'),
		countMode: text('count_mode'),
		target: integer('target'),
		isPrivate: boolean('is_private')
	},
	(table) => [
		unique('card_square_card_id_position_unique').on(table.cardId, table.position),
		check(
			'card_square_snapshot_check',
			sql`${table.isCenter} or ((${table.icon} is not null or ${table.emoji} is not null) and ${table.name} is not null and ${table.category} is not null and ${table.direction} is not null and ${table.period} is not null and ${table.countMode} is not null and ${table.target} is not null and ${table.isPrivate} is not null)`
		)
	]
);

/**
 * Card-builder progress, so closing the tab mid-build loses nothing. One per person per month, so
 * changing this month's card and building next month's don't collide.
 */
export const cardDraft = pgTable(
	'card_draft',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		month: text('month').notNull(),
		data: jsonb('data').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.userId, table.month] })]
);

/**
 * A finished month's score, saved once when the month turns final (spec §3.8), so later rule
 * changes or a late next-month card never rewrite it. `seenAt` drives Today's recap banner.
 */
export const monthResult = pgTable(
	'month_result',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		month: text('month').notNull(),
		/** Unused: points were removed. Nullable so the column can be dropped in a later migration. */
		points: integer('points'),
		lines: integer('lines').notNull(),
		tiers: text('tiers').array().$type<Tier[]>().notNull(),
		squaresCounting: integer('squares_counting').notNull(),
		size: integer('size').notNull(),
		seenAt: timestamp('seen_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.userId, table.month] })]
);
