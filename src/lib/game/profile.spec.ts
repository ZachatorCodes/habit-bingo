import { describe, expect, it } from 'vitest';
import { deleteConfirmed, isValidTimezone, timezoneOptions } from './profile.ts';

describe('profile', () => {
	it('accepts real timezones and UTC', () => {
		expect(isValidTimezone('UTC')).toBe(true);
		expect(isValidTimezone('Europe/London')).toBe(true);
	});

	it('rejects unknown timezones', () => {
		expect(isValidTimezone('Mars/Olympus')).toBe(false);
		expect(isValidTimezone('')).toBe(false);
	});
});

describe('timezoneOptions', () => {
	it('lists UTC first, then every zone, plus the current one if the runtime lacks it', () => {
		const zones = timezoneOptions('Europe/London');
		expect(zones[0]).toBe('UTC');
		expect(zones).toContain('Europe/London');
		expect(zones.filter((z) => z === 'UTC')).toHaveLength(1);
		expect(timezoneOptions('Mars/Olympus').slice(0, 2)).toEqual(['Mars/Olympus', 'UTC']);
	});
});

describe('deleteConfirmed', () => {
	it('matches the username, ignoring case, spaces and a leading @', () => {
		expect(deleteConfirmed(' @Sam_1 ', { username: 'sam_1', displayUsername: 'Sam_1' })).toBe(true);
		expect(deleteConfirmed('sam', { username: null, displayUsername: 'Sam' })).toBe(true);
		expect(deleteConfirmed('sam_2', { username: 'sam_1', displayUsername: null })).toBe(false);
		expect(deleteConfirmed('', { username: null, displayUsername: null })).toBe(false);
	});
});
