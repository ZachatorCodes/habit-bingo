import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './log.ts';

afterEach(() => vi.restoreAllMocks());

describe('log', () => {
	it('writes an error line as JSON with its keys in order', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		log({ level: 'error', source: 'db-pool', message: 'gone' });
		expect(error).toHaveBeenCalledWith('{"level":"error","source":"db-pool","message":"gone"}');
	});

	it('writes a warning to console.warn', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		log({ level: 'warn', source: 'hibp', message: 'slow' });
		expect(warn).toHaveBeenCalledWith('{"level":"warn","source":"hibp","message":"slow"}');
	});

	it('writes an app error entry unchanged', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		log({ level: 'error', errorId: 'id', path: '/x', message: 'boom' });
		expect(error).toHaveBeenCalledWith(
			'{"level":"error","errorId":"id","path":"/x","message":"boom"}'
		);
	});
});
