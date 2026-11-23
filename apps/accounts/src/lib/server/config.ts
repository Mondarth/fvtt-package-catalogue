/**
 * The accounts' configuration, read from the environment through `src/env.ts`, and by the migrations through
 * `src/migrate.ts`: one schema for each variable.
 */
import { z } from 'zod';

/** A PostgreSQL connection string. */
export const DatabaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ });

/**
 * The users who are admins whatever their role, by their user ids, separated by commas; none by default. The first
 * admin is made so: an admin can then make others admins from the admin pages.
 */
export const AdminUserIds = z
  .string()
  .optional()
  .transform(value =>
    (value ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id !== ''),
  );

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** The lowest level logged. */
export const LogLevel = z.enum(LOG_LEVELS).default('info');
export type LogLevel = z.infer<typeof LogLevel>;

/** Signs the website's cookies and encrypts what sign-in providers give: long, random, and kept secret. */
export const AuthSecret = z.string().min(32, 'AUTH_SECRET must be at least 32 characters');

/** The website's address as visitors reach it, without a trailing slash; sign-in providers send them back to it. */
export const SiteUrl = z.url({ protocol: /^https?$/ }).transform(url => url.replace(/\/+$/, ''));

/** Text the environment may leave out; compose gives one left unset in `.env` as empty, which is none. */
const given = z
  .string()
  .optional()
  .transform(value => (value === '' ? undefined : value));

/** A sign-in provider's app id or secret, left out where the provider is not offered. */
export const ProviderCredential = given;

/** The stand-in sign-in provider's address, for the end-to-end tests alone. */
export const TestProviderUrl = given.pipe(z.url().optional());

/** The catalogue's Patreon campaign, whose patrons are subscribed; none, and Patreon subscribes no one. */
export const PatreonCampaignId = given;

/** Patreon's address, for the end-to-end tests' stand-in alone: Patreon's own when unset. */
export const PatreonUrl = given.pipe(z.url().optional());

/**
 * Stripe's secret key: a restricted key that may write Checkout Sessions, Products and Prices. None, and nothing is
 * sold through Stripe. A sandbox's key (`sk_test_…`, `rk_test_…`) sells nothing for real.
 */
export const StripeSecretKey = given.pipe(
  z
    .string()
    .regex(/^(?:sk|rk)_(?:test|live)_\w+$/, 'a Stripe secret or restricted key, such as rk_live_…')
    .optional(),
);

/** The secret Stripe signs its webhook events with (`whsec_…`): needed with the secret key. */
export const StripeWebhookSecret = given.pipe(z.string().startsWith('whsec_', 'a webhook secret, whsec_…').optional());

/**
 * The tax code put on each offer's Stripe Product, which Stripe works out tax by: `txcd_10103000`, software as a
 * service for personal use, by default.
 */
export const StripeTaxCode = given.pipe(
  z
    .string()
    .regex(/^txcd_\d{8}$/, 'a Stripe tax code, such as txcd_10103000')
    .default('txcd_10103000'),
);

/** The one currency sold in through Stripe, `GBP` by default: an offer without a price in it is not sold there. */
export const StripeCurrency = given.pipe(
  z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'a currency code, such as GBP')
    .transform(code => code.toUpperCase())
    .default('GBP'),
);

/** Stripe's API's address, for the end-to-end tests' stand-in alone: Stripe's own when unset. */
export const StripeApiUrl = given.pipe(z.url().optional());

/** A list, separated by commas, each entry trimmed, empty entries left out. */
const list = z
  .string()
  .optional()
  .transform(value =>
    (value ?? '')
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry !== ''),
  );

/**
 * The keys the other applications call the internal API with, separated by commas; at least one, several so that a
 * key can be rotated. Each at least 32 characters, long and random.
 */
export const InternalApiKeys = list.pipe(
  z
    .array(z.string().min(32, 'each internal API key must be at least 32 characters'))
    .min(1, 'at least one internal API key is needed'),
);

/**
 * The domain the session cookie is set on, so that every Mondarth application's subdomain is signed in by it, such as
 * `example.org` for `accounts.example.org` and `catalogue.example.org`. None, and it is the accounts' host's alone, as
 * in development, where the applications share a host.
 */
export const CookieDomain = given.pipe(
  z
    .string()
    .regex(/^\.?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i, 'a domain, such as example.org')
    .transform(domain => domain.replace(/^\./, '').toLowerCase())
    .optional(),
);

/**
 * The other applications' addresses, separated by commas, such as `https://catalogue.example.org`: the accounts send
 * a visitor back to them after signing in, and take their requests to the accounts' own pages and endpoints.
 */
export const AppOrigins = list.pipe(z.array(z.url({ protocol: /^https?$/ }).transform(url => new URL(url).origin)));
