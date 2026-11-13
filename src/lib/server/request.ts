import { error, type Cookies } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import type { WeekStart } from '#lib/profile.ts';
import { requestNow } from './clock.ts';
import { getDb, type Db } from './db/client.ts';

/** The database, or a 503 with the page's own message when none is configured. */
export function requireDb(unavailable: string): Db {
	const db = getDb();
	if (!db) error(503, unavailable);
	return db;
}

/** A person's timezone and week start, with the defaults every page uses. */
export function personOf(user: { timezone?: string | null; weekStartsOn?: string | null }): {
	timezone: string;
	weekStartsOn: WeekStart;
} {
	return {
		timezone: user.timezone ?? 'UTC',
		weekStartsOn: user.weekStartsOn === 'sunday' ? 'sunday' : 'monday'
	};
}

/** "Now" for this request (the E2E test clock when enabled). */
export function requestClock(cookies: Cookies): Date {
	return requestNow(cookies, TEST_CLOCK);
}

/** A form field's text, or '' when it is missing or a file. Not trimmed. */
export function formText(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value : '';
}

/** Reads the request's form once and returns a field reader. */
export async function readForm(request: Request): Promise<(key: string) => string> {
	const form = await request.formData();
	return (key) => formText(form, key);
}
