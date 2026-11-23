import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../src/lib/server/log.js';

function capture(level: 'debug' | 'info' | 'warn' | 'error') {
  const lines: string[] = [];
  const log = createLogger({ level, write: line => lines.push(line), now: () => new Date('2026-10-24T09:00:00Z') });
  return { log, lines };
}

describe('createLogger', () => {
  it('writes one JSON object per line', () => {
    const { log, lines } = capture('debug');
    log.info('started', { port: 3000 });
    expect(lines).toEqual(['{"time":"2026-10-24T09:00:00.000Z","level":"info","message":"started","port":3000}']);
  });

  it('leaves out what is below its level', () => {
    const { log, lines } = capture('warn');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines.map(line => (JSON.parse(line) as { message: string }).message)).toEqual(['c', 'd']);
  });

  it('carries the fields of its children', () => {
    const { log, lines } = capture('info');
    log.child({ requestId: 'r1' }).child({ job: 'sync' }).info('done', { job: 'index' });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ requestId: 'r1', job: 'index' });
  });

  it('keeps what an error says', () => {
    const { log, lines } = capture('info');
    log.error('failed', { error: new TypeError('bad') });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ error: { name: 'TypeError', message: 'bad' } });
  });

  // Regression: a failed migration logged Drizzle's "Failed query" without the database's reason, its cause.
  it('keeps what caused an error', () => {
    const { log, lines } = capture('info');
    log.error('failed', { error: new Error('Failed query', { cause: new Error('connection refused') }) });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      error: { message: 'Failed query', cause: { message: 'connection refused' } },
    });
  });

  it('keeps a cause that is not an error as it is', () => {
    const { log, lines } = capture('info');
    log.error('failed', { error: new Error('outer', { cause: 'just text' }) });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ error: { cause: 'just text' } });
  });

  it('stamps lines with the current time by default', () => {
    const lines: string[] = [];
    createLogger({ level: 'info', write: line => lines.push(line) }).info('now');
    expect(Date.parse((JSON.parse(lines[0] ?? '') as { time: string }).time)).not.toBeNaN();
  });

  it('writes to standard output by default', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    createLogger({ level: 'info' }).info('out');
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/"message":"out"\}\n$/));
    write.mockRestore();
  });
});
