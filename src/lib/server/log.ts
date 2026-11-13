import type { LogEntry } from './errors.ts';

/** A structured server log line: an app error, or a problem reported by one part of the server. */
export type LogLine = LogEntry | { level: 'error' | 'warn'; source: string; message: string };

/** Writes one JSON line to the console at its level. */
export function log(line: LogLine): void {
	console[line.level](JSON.stringify(line));
}
