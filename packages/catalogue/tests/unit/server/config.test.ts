import { describe, expect, it } from 'vitest';

import { ApiKeys, DatabaseUrl, LogLevel, readConfig } from '../../../src/lib/server/config.js';

const DATABASE_URL = 'postgres://catalogue:secret@db:5432/catalogue';

describe('DatabaseUrl', () => {
  it.each([DATABASE_URL, 'postgresql://localhost/catalogue'])('accepts %s', url => {
    expect(DatabaseUrl.parse(url)).toBe(url);
  });

  it.each(['mysql://localhost/catalogue', 'catalogue'])('rejects %s', url => {
    expect(DatabaseUrl.safeParse(url).success).toBe(false);
  });
});

describe('ApiKeys', () => {
  it('splits keys on commas, trimmed, dropping empty ones', () => {
    expect(ApiKeys.parse(' one, two ,,three ')).toEqual(['one', 'two', 'three']);
  });

  it.each(['', ' , ', undefined])('needs at least one key, not %j', value => {
    expect(ApiKeys.safeParse(value).success).toBe(false);
  });
});

describe('LogLevel', () => {
  it('defaults to info', () => {
    expect(LogLevel.parse(undefined)).toBe('info');
  });

  it('rejects an unknown level', () => {
    expect(LogLevel.safeParse('verbose').success).toBe(false);
  });
});

describe('readConfig', () => {
  it("reads the worker's configuration, with defaults", () => {
    expect(readConfig({ DATABASE_URL })).toEqual({ DATABASE_URL, LOG_LEVEL: 'info', MIGRATIONS_DIR: 'drizzle' });
  });

  it('names every variable that is wrong', () => {
    expect(() => readConfig({ LOG_LEVEL: 'loud' })).toThrow(/DATABASE_URL[\s\S]*LOG_LEVEL/);
  });
});
