import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { tryGetAuth } from '#lib/server/auth/index.ts';
import { isSharedCacheable, PUBLIC_CACHED_ROUTES } from '#lib/server/cache.ts';
import { toAppError } from '#lib/server/errors.ts';
import { log } from '#lib/server/log.ts';
import { SECURITY_HEADERS } from '#lib/server/security-headers.ts';

/** Loads the session into `locals` and serves Better Auth's routes under /api/auth. */
export const authHandle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	// Without a database or secret the app still serves public pages; nobody is signed in.
	const auth = building ? null : tryGetAuth();
	if (!auth) return resolve(event);
	// CDN-cached public pages are the same for everyone and never read `locals.user`. Looking the
	// session up there could refresh it and put the visitor's Set-Cookie into a shared cache.
	if (event.route.id && PUBLIC_CACHED_ROUTES.has(event.route.id)) return resolve(event);

	try {
		const result = await auth.api.getSession({ headers: event.request.headers });
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	} catch (error) {
		// A database outage must not take down public pages or /api/health; treat it as signed out.
		log({
			level: 'error',
			source: 'auth-session',
			message: error instanceof Error ? error.message : String(error)
		});
	}
	return svelteKitHandler({ auth, event, resolve, building });
};

/** Applies `set` to the response's headers, copying the response first if they are immutable. */
function editHeaders(response: Response, set: (headers: Headers) => void): Response {
	try {
		set(response.headers);
		return response;
	} catch {
		// Some responses (Response.redirect, proxied fetch) have immutable headers; copy them first.
		const copy = new Response(response.body, response);
		set(copy.headers);
		return copy;
	}
}

/**
 * Backstop for the auth hook's skip: a response a shared cache may store never carries a cookie,
 * or the CDN would hand one visitor's session to everyone.
 */
export const publicCacheCookieHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!isSharedCacheable(response.headers) || !response.headers.has('set-cookie')) return response;
	return editHeaders(response, (headers) => headers.delete('set-cookie'));
};

export const securityHeadersHandle: Handle = async ({ event, resolve }) =>
	editHeaders(await resolve(event), setSecurityHeaders);

/**
 * Per-route headers, set once here rather than with `setHeaders` in loads and actions: a no-JS
 * form POST runs the action and then the loads in one request, and setting a header twice throws.
 * Covers pages, action results, redirects and error pages alike.
 */
const ROUTE_HEADERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	// The token in the URL is a bearer secret: never cached, and its path never sent on as a
	// referrer. `strict-origin` rather than `no-referrer`: the latter makes browsers send
	// `Origin: null` on a no-JS form POST, which SvelteKit's CSRF check rejects.
	'/reset/[token]': { 'cache-control': 'no-store', 'referrer-policy': 'strict-origin' },
	// Action results carry invite and reset links.
	'/(app)/admin': { 'cache-control': 'private, no-store' }
};

export const routeHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = event.route.id ? ROUTE_HEADERS[event.route.id] : undefined;
	if (!headers) return response;
	return editHeaders(response, (target) => {
		for (const [name, value] of Object.entries(headers)) target.set(name, value);
	});
};

// Security headers wrap auth so Better Auth's own /api/auth responses get them too (spec §5.4).
// Route headers sit inside them, so the security hook sees (and keeps) the reset page's stricter
// Referrer-Policy. The public-cache cookie backstop is outermost, so it sees the final headers.
export const handle = sequence(
	publicCacheCookieHandle,
	securityHeadersHandle,
	routeHeadersHandle,
	authHandle
);

/**
 * Only `strict-origin` (origin only, never the path) may replace the default, for pages with a
 * secret in their URL (/reset).
 */
const STRICTER_REFERRER_POLICY = 'strict-origin';

function setSecurityHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (
			name.toLowerCase() === 'referrer-policy' &&
			headers.get(name) === STRICTER_REFERRER_POLICY
		) {
			continue;
		}
		headers.set(name, value);
	}
}

export const handleError: HandleServerError = ({ kind, error, event }) => {
	// App errors, validation errors and SvelteKit's own (like 404) already carry safe messages.
	if (kind !== 'unknown') return;
	return toAppError(error, loggablePath(event.url.pathname), log);
};

/** The path for logs, with bearer secrets (reset-link tokens) taken out. */
function loggablePath(pathname: string): string {
	return pathname.replace(/^\/reset\/[^/]+/, '/reset/[token]');
}
