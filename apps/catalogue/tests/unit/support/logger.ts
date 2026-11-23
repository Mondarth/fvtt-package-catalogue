import { createLogger, type Logger } from '../../../src/lib/server/log.js';

/** A logger that keeps what it writes, parsed. */
export function memoryLogger(): Logger & { readonly lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    level: 'debug',
    write: line => lines.push(JSON.parse(line) as Record<string, unknown>),
    now: () => new Date('2026-10-24T09:00:00.000Z'),
  });
  return Object.assign(logger, { lines });
}
