import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';
import { log } from '../log.ts';

/** The database handle every service takes. Postgres via node-postgres in production and E2E, PGlite in unit tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string, poolSize = 5): Db {
	const pool = new pg.Pool({
		connectionString: url,
		connectionTimeoutMillis: 5000,
		max: poolSize
	});
	// An idle pooled client can fail when Neon suspends compute or drops the socket.
	// Unhandled, that 'error' event would crash the whole function instance.
	pool.on('error', (error: Error) =>
		log({ level: 'error', source: 'db-pool', message: error.message })
	);
	return drizzle(pool, { schema });
}

let cached: Db | undefined;

/** Lazily connects on first use; returns null when no database is configured. */
export function getDb(): Db | null {
	if (!DATABASE_URL) return null;
	// DB_POOL_MAX is only set by the E2E server, whose single in-memory PGlite session cannot
	// interleave concurrent connections; production leaves it unset (5).
	const poolSize = Number(process.env.DB_POOL_MAX);
	cached ??= createDb(DATABASE_URL, Number.isInteger(poolSize) && poolSize > 0 ? poolSize : 5);
	return cached;
}
