import { describe, expect, it } from 'vitest';

import {
  ApiKeys,
  AuthSecret,
  DatabaseUrl,
  LogLevel,
  ProviderCredential,
  readConfig,
  SiteUrl,
  TestProviderUrl,
} from '../../../src/lib/server/config.js';

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

describe('AuthSecret', () => {
  it('takes a secret of 32 characters or more, and nothing shorter', () => {
    expect(AuthSecret.parse('x'.repeat(32))).toBe('x'.repeat(32));
    expect(AuthSecret.safeParse('x'.repeat(31)).success).toBe(false);
  });
});

describe('SiteUrl', () => {
  it('takes an http or https address, without a trailing slash', () => {
    expect(SiteUrl.parse('https://catalogue.example.org/')).toBe('https://catalogue.example.org');
    expect(SiteUrl.parse('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(SiteUrl.safeParse('ftp://catalogue.example.org').success).toBe(false);
  });
});

describe('the sign-in providers', () => {
  it('take an empty value, or none, as a provider not set up', () => {
    expect(ProviderCredential.parse('')).toBeUndefined();
    expect(ProviderCredential.parse(undefined)).toBeUndefined();
    expect(ProviderCredential.parse('id')).toBe('id');
    expect(TestProviderUrl.parse('')).toBeUndefined();
    expect(TestProviderUrl.parse('http://127.0.0.1:4174')).toBe('http://127.0.0.1:4174');
    expect(TestProviderUrl.safeParse('not a url').success).toBe(false);
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
    expect(readConfig({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      LOG_LEVEL: 'info',
      MIGRATIONS_DIR: 'drizzle',
      CRAWL_MAX_REQUESTS: 5000,
      CRAWL_POLL_SECONDS: 5,
      REFRESH_MINUTES: 60,
      REFRESH_STALE_DAYS: 7,
      WARM_PER_HOUR: 300,
      OWN_MANIFEST_CHECK_MINUTES: 60,
      CACHE_ENTRIES: 5000,
      CRAWL_CONCURRENCY: 4,
      CRAWL_PER_HOST: 4,
      PACKAGE_OVERRIDES_FILE: 'overrides.json',
      FOUNDRY_INDEX_URL: 'https://r2.foundryvtt.com/package-api-public/index-latest.json',
      FOUNDRY_RELEASES_URL: 'https://foundryvtt.com/releases/',
    });
  });

  it('reads the tokens and the limits given', () => {
    expect(
      readConfig({
        DATABASE_URL,
        GITHUB_TOKEN: 'gh',
        GITLAB_TOKEN: 'gl',
        CRAWL_MAX_REQUESTS: '200',
        CRAWL_POLL_SECONDS: '30',
      }),
    ).toMatchObject({ GITHUB_TOKEN: 'gh', GITLAB_TOKEN: 'gl', CRAWL_MAX_REQUESTS: 200, CRAWL_POLL_SECONDS: 30 });
  });

  // Compose passes a variable left unset in .env as empty.
  it('takes an empty token as none', () => {
    const config = readConfig({ DATABASE_URL, GITHUB_TOKEN: '', GITLAB_TOKEN: '' });
    expect(config.GITHUB_TOKEN).toBeUndefined();
    expect(config.GITLAB_TOKEN).toBeUndefined();
  });

  it('refuses a budget that is not a whole number above none', () => {
    expect(() => readConfig({ DATABASE_URL, CRAWL_MAX_REQUESTS: '0' })).toThrow(/CRAWL_MAX_REQUESTS/);
    expect(() => readConfig({ DATABASE_URL, CRAWL_POLL_SECONDS: 'soon' })).toThrow(/CRAWL_POLL_SECONDS/);
    expect(() => readConfig({ DATABASE_URL, REFRESH_MINUTES: '-1' })).toThrow(/REFRESH_MINUTES/);
    expect(() => readConfig({ DATABASE_URL, REFRESH_STALE_DAYS: '1.5' })).toThrow(/REFRESH_STALE_DAYS/);
  });

  it('takes no warming an hour as warming off, and refuses less', () => {
    expect(readConfig({ DATABASE_URL, WARM_PER_HOUR: '0' }).WARM_PER_HOUR).toBe(0);
    expect(() => readConfig({ DATABASE_URL, WARM_PER_HOUR: '-1' })).toThrow(/WARM_PER_HOUR/);
  });

  it('names every variable that is wrong', () => {
    expect(() => readConfig({ LOG_LEVEL: 'loud' })).toThrow(/DATABASE_URL[\s\S]*LOG_LEVEL/);
  });
});
