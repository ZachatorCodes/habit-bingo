import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import { isIconName } from '#lib/game/icons.ts';
import { EMOJI_TO_ICON } from './emoji-icons.ts';

// Frozen copies of the retired emoji lists, so the map stays checked after they leave the app.
const STARTER_EMOJI = ['📚', '🚴', '🧘', '🧹', '🐈', '💧', '📞', '🍔', '😴', '🍺'];
const CATEGORY_EMOJI = ['💪', '🥗', '🧠', '🏠', '👥', '📚', '🎨', '💰', '✨'];
const AVATAR_EMOJI = [
	...'🙂😎🤓🥳😺🐶🦊🐼🐸🐵🦄🐙🌵🌻🍀🍉🍕🍩⚽🏀🎸🎨🚀⭐'.match(/\p{Extended_Pictographic}/gu)!
];
const SUGGESTION_EMOJI = [
	...['🚴', '🏃', '🏋️', '🧘', '🏊', '🥾', '💧', '🥗', '😴', '💊', '🍎', '🚭'],
	...['🧠', '📓', '🙏', '🌿', '📵', '🧩', '🧹', '🧺', '🍳', '🌱', '🐈', '🗑️'],
	...['📞', '💌', '🎂', '🤝', '👋', '🍻', '📚', '🎧', '🗣️', '💻', '✍️', '🔬'],
	...['🎨', '🎸', '📷', '🧶', '🎹', '✏️', '💰', '🍔', '🛍️', '📊', '☕', '🏦'],
	...['✨', '⭐', '🎯', '✅', '🔥', '🌈']
];

describe('EMOJI_TO_ICON', () => {
	it('maps every starter, category, avatar and suggestion emoji to a curated icon', () => {
		for (const e of [...STARTER_EMOJI, ...CATEGORY_EMOJI, ...AVATAR_EMOJI, ...SUGGESTION_EMOJI])
			expect(isIconName(EMOJI_TO_ICON[e]), e).toBe(true);
	});

	it('the migration SQL mirrors the map exactly', () => {
		const sql = readFileSync('drizzle/0011_icons.sql', 'utf8');
		for (const [emoji, icon] of Object.entries(EMOJI_TO_ICON))
			expect(sql).toContain(`WHEN '${emoji}' THEN '${icon}'`);
	});
});

describe('migration 0011 backfill', () => {
	const cleanup: (() => void)[] = [];
	afterEach(async () => {
		for (const fn of cleanup.splice(0)) await fn();
	});

	/** A database migrated to 0010 with `seed` run, then migrated on to 0011. */
	async function migrated(seed: (pg: PGlite) => Promise<void>) {
		const dir = mkdtempSync(join(tmpdir(), 'drizzle-0010-'));
		cpSync('drizzle', dir, { recursive: true });
		const journalPath = join(dir, 'meta', '_journal.json');
		const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
		journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 10);
		writeFileSync(journalPath, JSON.stringify(journal));
		const pg = new PGlite();
		cleanup.push(() => pg.close());
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		await migrate(drizzle(pg), { migrationsFolder: dir });
		await seed(pg);
		await migrate(drizzle(pg), { migrationsFolder: 'drizzle' });
		return pg;
	}

	const addUser = (pg: PGlite, id: string, avatar: string) =>
		pg.query(
			`INSERT INTO "user" (id, name, email, avatar_emoji) VALUES ($1, $1, $1 || '@x.test', $2)`,
			[id, avatar]
		);

	it('backfills mapped emoji', async () => {
		const pg = await migrated(async (pg) => {
			await addUser(pg, 'u1', '🦊');
			await pg.query(
				`INSERT INTO habit (id, user_id, emoji, name, category, direction, period, count_mode, target)
				 VALUES ('h1', 'u1', '📚', 'Read', 'learning', 'atLeast', 'week', 'times', 3)`
			);
			await pg.query(`INSERT INTO "group" (id, name, emoji) VALUES ('g1', 'Crew', '⚽')`);
		});
		expect((await pg.query(`SELECT icon FROM habit`)).rows).toEqual([{ icon: 'book-open' }]);
		expect((await pg.query(`SELECT icon FROM "group"`)).rows).toEqual([{ icon: 'soccer-ball' }]);
		expect((await pg.query(`SELECT avatar_icon FROM "user"`)).rows).toEqual([
			{ avatar_icon: 'dog' }
		]);
	});

	it('backfills unmapped emoji to sparkle', async () => {
		const pg = await migrated(async (pg) => {
			await addUser(pg, 'u1', '🦖');
			await pg.query(
				`INSERT INTO habit (id, user_id, emoji, name, category, direction, period, count_mode, target)
				 VALUES ('h1', 'u1', '🦖', 'Roar', 'other', 'atLeast', 'week', 'times', 3)`
			);
		});
		expect((await pg.query(`SELECT icon FROM habit`)).rows).toEqual([{ icon: 'sparkle' }]);
		expect((await pg.query(`SELECT avatar_icon FROM "user"`)).rows).toEqual([
			{ avatar_icon: 'smiley' }
		]);
	});

	it('backfills card squares and leaves the center null', async () => {
		const pg = await migrated(async (pg) => {
			await addUser(pg, 'u1', '🙂');
			await pg.query(
				`INSERT INTO card (id, user_id, month, size, start_date, editable_until, week_starts_on, reward_bingo, reward_sixty, reward_blackout)
				 VALUES ('c1', 'u1', '2026-10', 3, '2026-10-01', now(), 'monday', 'a', 'b', 'c')`
			);
			await pg.query(
				`INSERT INTO card_square (id, card_id, position, is_center, emoji, name, category, direction, period, count_mode, target, is_private)
				 VALUES ('s1', 'c1', 0, false, '💧', 'Water', 'health', 'atLeast', 'day', 'times', 1, false)`
			);
			await pg.query(
				`INSERT INTO card_square (id, card_id, position, is_center) VALUES ('s2', 'c1', 4, true)`
			);
		});
		expect((await pg.query(`SELECT id, icon FROM card_square ORDER BY id`)).rows).toEqual([
			{ id: 's1', icon: 'drop' },
			{ id: 's2', icon: null }
		]);
	});

	it('accepts an emoji-only square (pre-0011 code) and rejects one with no icon or emoji', async () => {
		const pg = await migrated(async (pg) => {
			await addUser(pg, 'u1', '🙂');
			await pg.query(
				`INSERT INTO card (id, user_id, month, size, start_date, editable_until, week_starts_on, reward_bingo, reward_sixty, reward_blackout)
				 VALUES ('c1', 'u1', '2026-10', 3, '2026-10-01', now(), 'monday', 'a', 'b', 'c')`
			);
		});
		const insert = (id: string, position: number, emoji: string | null) =>
			pg.query(
				`INSERT INTO card_square (id, card_id, position, is_center, emoji, name, category, direction, period, count_mode, target, is_private)
				 VALUES ($1, 'c1', $2, false, $3, 'Water', 'health', 'atLeast', 'day', 'times', 1, false)`,
				[id, position, emoji]
			);
		await insert('s1', 0, '💧');
		await expect(insert('s2', 1, null)).rejects.toThrow();
	});
});
