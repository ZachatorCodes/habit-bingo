import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ DATABASE_URL: undefined, TEST_CLOCK: true }));

describe('requireDb', () => {
	it('throws a 503 with the page message when no database is configured', async () => {
		const { requireDb } = await import('./request.ts');
		expect(() => requireDb('Today is not available right now.')).toThrow(
			expect.objectContaining({
				status: 503,
				body: expect.objectContaining({ message: 'Today is not available right now.' })
			})
		);
	});
});

describe('personOf', () => {
	it('defaults the timezone to UTC and the week start to Monday', async () => {
		const { personOf } = await import('./request.ts');
		expect(personOf({})).toEqual({ timezone: 'UTC', weekStartsOn: 'monday' });
		expect(personOf({ timezone: null, weekStartsOn: null })).toEqual({
			timezone: 'UTC',
			weekStartsOn: 'monday'
		});
		expect(personOf({ timezone: 'Europe/Paris', weekStartsOn: 'sunday' })).toEqual({
			timezone: 'Europe/Paris',
			weekStartsOn: 'sunday'
		});
	});
});

describe('requestClock', () => {
	it('reads the test clock cookie when TEST_CLOCK is on', async () => {
		const { requestClock } = await import('./request.ts');
		const cookies = { get: () => '2026-10-15T12:00:00.000Z' } as never;
		expect(requestClock(cookies).toISOString()).toBe('2026-10-15T12:00:00.000Z');
	});
});

describe('form readers', () => {
	it('give a string field as is and anything else as an empty string', async () => {
		const { formText, readForm } = await import('./request.ts');
		const form = new FormData();
		form.set('name', '  Sam ');
		form.set('file', new Blob(['x']));
		expect(formText(form, 'name')).toBe('  Sam ');
		expect(formText(form, 'file')).toBe('');
		expect(formText(form, 'missing')).toBe('');
		const text = await readForm(new Request('http://x', { method: 'POST', body: form }));
		expect(text('name')).toBe('  Sam ');
		expect(text('missing')).toBe('');
	});
});
