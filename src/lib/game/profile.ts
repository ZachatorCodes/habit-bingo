export type WeekStart = 'monday' | 'sunday';

/** True for IANA zone names the runtime knows, plus `UTC`. */
export function isValidTimezone(tz: string): boolean {
	return tz === 'UTC' || Intl.supportedValuesOf('timeZone').includes(tz);
}

/** Every zone this runtime knows, with UTC first, plus `current` if it has gone missing. */
export function timezoneOptions(current: string): string[] {
	const zones = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')];
	return zones.includes(current) ? zones : [current, ...zones];
}

/** Whether the typed text confirms deleting the account: its username, any case, with or without @. */
export function deleteConfirmed(
	typed: string,
	user: { username?: string | null; displayUsername?: string | null }
): boolean {
	const expected = (user.username ?? user.displayUsername ?? '').toLowerCase();
	return expected !== '' && typed.trim().replace(/^@/, '').toLowerCase() === expected;
}
