import { log } from '../log.ts';
import { createHash } from 'node:crypto';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Whether a password appears in Have I Been Pwned's breach corpus, via the k-anonymity range API:
 * only the first five characters of the password's SHA-1 ever leave the server. Padding is
 * requested so the response size does not hint at the prefix either.
 *
 * Fails open: if the API is unreachable or answers with anything but 200, the password is treated
 * as not breached (and a warning is logged) so an outage never blocks sign-up.
 */
export async function isPwnedPassword(
	password: string,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
	const prefix = hash.slice(0, 5);
	const suffix = hash.slice(5);
	try {
		const res = await fetchFn(RANGE_URL + prefix, {
			headers: { 'Add-Padding': 'true' },
			signal: AbortSignal.timeout(3000)
		});
		if (res.status !== 200) {
			warn(`HIBP range lookup answered ${res.status}`);
			return false;
		}
		for (const line of (await res.text()).split('\n')) {
			const [lineSuffix, count] = line.trim().split(':');
			if (lineSuffix === suffix) return Number(count) > 0;
		}
		return false;
	} catch (error) {
		warn(`HIBP range lookup failed: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

function warn(message: string) {
	log({ level: 'warn', source: 'hibp', message });
}
