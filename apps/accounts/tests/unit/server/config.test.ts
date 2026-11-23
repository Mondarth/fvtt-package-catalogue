import { describe, expect, it } from 'vitest';

import {
  AdminUserIds,
  AppOrigins,
  AuthSecret,
  CookieDomain,
  DatabaseUrl,
  InternalApiKeys,
  LogLevel,
  PatreonCampaignId,
  PatreonUrl,
  ProviderCredential,
  SiteUrl,
  StripeApiUrl,
  StripeCurrency,
  StripeSecretKey,
  StripeTaxCode,
  StripeWebhookSecret,
  TestProviderUrl,
} from '../../../src/lib/server/config.js';

const DATABASE_URL = 'postgres://accounts:secret@db:5432/accounts';

describe('DatabaseUrl', () => {
  it.each([DATABASE_URL, 'postgresql://localhost/accounts'])('accepts %s', url => {
    expect(DatabaseUrl.parse(url)).toBe(url);
  });

  it.each(['mysql://localhost/accounts', 'accounts'])('rejects %s', url => {
    expect(DatabaseUrl.safeParse(url).success).toBe(false);
  });
});

describe('AdminUserIds', () => {
  it('reads the ids separated by commas, and none when unset or empty', () => {
    expect(AdminUserIds.parse(' u1, u2 ,,u3 ')).toEqual(['u1', 'u2', 'u3']);
    expect(AdminUserIds.parse('')).toEqual([]);
    expect(AdminUserIds.parse(undefined)).toEqual([]);
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

describe('Stripe', () => {
  it("is set up by a secret or restricted key, a sandbox's or a live one, with its webhook secret", () => {
    expect(StripeSecretKey.parse('')).toBeUndefined();
    expect(StripeSecretKey.parse('rk_test_abc123')).toBe('rk_test_abc123');
    expect(StripeSecretKey.parse('sk_live_abc123')).toBe('sk_live_abc123');
    expect(StripeSecretKey.safeParse('pk_live_abc123').success).toBe(false);
    expect(StripeWebhookSecret.parse(undefined)).toBeUndefined();
    expect(StripeWebhookSecret.parse('whsec_abc')).toBe('whsec_abc');
    expect(StripeWebhookSecret.safeParse('abc').success).toBe(false);
  });

  it('puts the tax code for software as a service on its Products, and sells in pounds, unless told otherwise', () => {
    expect(StripeTaxCode.parse('')).toBe('txcd_10103000');
    expect(StripeTaxCode.parse('txcd_10000000')).toBe('txcd_10000000');
    expect(StripeTaxCode.safeParse('10103000').success).toBe(false);
    expect(StripeCurrency.parse(undefined)).toBe('GBP');
    expect(StripeCurrency.parse('eur')).toBe('EUR');
    expect(StripeCurrency.safeParse('pounds').success).toBe(false);
    expect(StripeApiUrl.parse('')).toBeUndefined();
    expect(StripeApiUrl.parse('http://127.0.0.1:4175')).toBe('http://127.0.0.1:4175');
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

describe('Patreon', () => {
  it("is a campaign, and, for the tests' stand-in alone, an address", () => {
    expect(PatreonCampaignId.parse('')).toBeUndefined();
    expect(PatreonCampaignId.parse('123')).toBe('123');
    expect(PatreonUrl.parse(undefined)).toBeUndefined();
    expect(PatreonUrl.safeParse('not a url').success).toBe(false);
  });
});

describe('InternalApiKeys', () => {
  const KEY = 'k'.repeat(32);

  it('splits keys on commas, trimmed, dropping empty ones', () => {
    expect(InternalApiKeys.parse(` ${KEY} , ,${KEY.toUpperCase()}`)).toEqual([KEY, KEY.toUpperCase()]);
  });

  it.each(['', ' , ', undefined])('needs at least one key, not %j', value => {
    expect(InternalApiKeys.safeParse(value).success).toBe(false);
  });

  it('refuses a key shorter than 32 characters', () => {
    expect(InternalApiKeys.safeParse(`${KEY},short`).success).toBe(false);
  });
});

describe('CookieDomain', () => {
  it('takes a domain, without a leading dot, in lower case, and none when unset or empty', () => {
    expect(CookieDomain.parse('Example.org')).toBe('example.org');
    expect(CookieDomain.parse('.mondarth.example.org')).toBe('mondarth.example.org');
    expect(CookieDomain.parse('')).toBeUndefined();
    expect(CookieDomain.parse(undefined)).toBeUndefined();
  });

  it.each(['localhost', 'https://example.org', 'exa mple.org'])('refuses %j', value => {
    expect(CookieDomain.safeParse(value).success).toBe(false);
  });
});

describe('AppOrigins', () => {
  it("reads the applications' origins, separated by commas, and none when unset", () => {
    expect(AppOrigins.parse('https://catalogue.example.org/, http://localhost:5173')).toEqual([
      'https://catalogue.example.org',
      'http://localhost:5173',
    ]);
    expect(AppOrigins.parse(undefined)).toEqual([]);
  });

  it('refuses what is not a web address', () => {
    expect(AppOrigins.safeParse('ftp://example.org').success).toBe(false);
  });
});
