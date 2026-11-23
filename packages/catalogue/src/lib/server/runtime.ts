/**
 * The server's long-lived parts, made once when it starts: the connection pool, the store, the logger, and the client
 * that requests which fetch, such as rechecks, fetch with.
 */
import { MAX_RECHECK_PACKAGES } from '@mondarth/fvtt-package-catalogue-contract';
import { httpClient } from '@mondarth/fvtt-resolver/sources';

import {
  ADMIN_USER_IDS,
  API_KEYS,
  API_RATE_PER_MINUTE,
  AUTH_DISCORD_ID,
  AUTH_DISCORD_SECRET,
  AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET,
  AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET,
  AUTH_PATREON_ID,
  AUTH_PATREON_SECRET,
  AUTH_SECRET,
  AUTH_TEST_PROVIDER_URL,
  DATABASE_URL,
  LOG_LEVEL,
  PATREON_CAMPAIGN_ID,
  PATREON_URL,
  SITE_URL,
  STRIPE_API_URL,
  STRIPE_CURRENCY,
  STRIPE_SECRET_KEY,
  STRIPE_TAX_CODE,
  STRIPE_WEBHOOK_SECRET,
} from '$app/env/private';

import { accessRecorder } from './accounts/access.js';
import { auditStore } from './accounts/audit.js';
import { createAuth, providerApp, signInProviders } from './accounts/auth.js';
import { banNotices as signedBanNotices } from './accounts/ban-notice.js';
import { devPatreon } from './accounts/dev-patreon.js';
import { testProviderUrl } from './accounts/dev-provider.js';
import { accountsStore } from './accounts/store.js';
import { isAdmin } from './accounts/permissions.js';
import { cachedEntitlements, subscribedBy } from './subscriptions/entitlement.js';
import { patreonChecker } from './subscriptions/patreon.js';
import { stripeGateway } from './subscriptions/stripe.js';
import { subscriptionStore } from './subscriptions/store.js';

import type { ApiUsers } from './http/handle.js';

import { connect } from './db/connect.js';
import { createLogger } from './log.js';
import { lruCache, versionsOnly } from './lru-cache.js';
import { safeFetch } from './safe-fetch.js';
import { drizzleStore } from './store/drizzle.js';

export const log = createLogger({ level: LOG_LEVEL });
export const connection = connect(DATABASE_URL);
export const store = drizzleStore(connection.db);
export const apiKeys = API_KEYS;

/** Patreon as set, or, on the development server without a Patreon app, its stand-in (dev-patreon.ts). */
const patreonSetting = devPatreon(
  { app: providerApp(AUTH_PATREON_ID, AUTH_PATREON_SECRET), url: PATREON_URL, campaignId: PATREON_CAMPAIGN_ID },
  SITE_URL,
  import.meta.env.DEV,
);

/** Each provider's app, where both its id and secret are set. */
const apps = {
  github: providerApp(AUTH_GITHUB_ID, AUTH_GITHUB_SECRET),
  google: providerApp(AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET),
  discord: providerApp(AUTH_DISCORD_ID, AUTH_DISCORD_SECRET),
  patreon: patreonSetting.app,
};

/** The stand-in provider: the one the end-to-end tests run, or, on the development server, its own (dev-provider.ts). */
const testProvider = testProviderUrl(AUTH_TEST_PROVIDER_URL, SITE_URL, import.meta.env.DEV);

/** Users' access, recorded while a payment of theirs is disputed. */
export const access = accessRecorder(connection.db);

/** What admins have done. */
export const audit = auditStore(connection.db);

/** The users who are admins whatever their role. */
export const adminUserIds: readonly string[] = ADMIN_USER_IDS;

/** The notices a banned user's sign-in comes back with, signed with the site's secret as Better Auth's are. */
export const banNotices = signedBanNotices(AUTH_SECRET);

/** Signing in to the website. */
export const auth = createAuth({
  db: connection.db,
  secret: AUTH_SECRET,
  siteUrl: SITE_URL,
  ...apps,
  testProviderUrl: testProvider,
  patreonUrl: patreonSetting.url,
  adminUserIds,
  audit,
});

/**
 * Patreon, as a way to be subscribed, where signing in with it is set up: asked with each user's own token, which Better
 * Auth refreshes when it has expired.
 */
export const patreon =
  apps.patreon === undefined
    ? undefined
    : patreonChecker({
        db: connection.db,
        campaignId: patreonSetting.campaignId,
        ...(patreonSetting.url !== undefined && { baseUrl: patreonSetting.url }),
        accessToken: async (userId, accountId) =>
          (await auth.api.getAccessToken({ body: { accountId, userId } })).accessToken,
      });

/**
 * Stripe, through which subscription time is sold, where its key is set: its webhook secret is needed with it, as no
 * payment could be credited without.
 */
export const stripe = (() => {
  if (STRIPE_SECRET_KEY === undefined) return undefined;
  if (STRIPE_WEBHOOK_SECRET === undefined) throw new Error('STRIPE_WEBHOOK_SECRET is needed with STRIPE_SECRET_KEY');
  return stripeGateway({
    secretKey: STRIPE_SECRET_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    taxCode: STRIPE_TAX_CODE,
    currency: STRIPE_CURRENCY,
    apiUrl: STRIPE_API_URL,
  });
})();

/** Subscriptions, and the offers they are bought by. */
export const subscriptions = subscriptionStore(connection.db);

/** The accounts' tables, beyond what Better Auth does itself. */
export const accounts = accountsStore(connection.db);

/** The providers the sign-in page offers. */
export const providers = signInProviders({ ...apps, testProviderUrl: testProvider });

// The versions of packages' own manifests rechecked, so that each is revalidated by its ETag, as the worker's are.
const versions = versionsOnly(lruCache(5000));

const userAgent = `fvtt-package-catalogue/${__CATALOGUE_VERSION__} (+https://mondarth.github.io/fvtt-package-catalogue/)`;

/** Fetches a URL a client gave, such as a manifest to install from, refusing what only the server may reach. */
export const fetchGiven = (url: string) => safeFetch(url, { userAgent });

/** A client for one request, as many requests as packages a recheck may ask for, through the server's own cache. */
export const http = () =>
  httpClient({
    fetch: globalThis.fetch,
    cache: versions,
    budget: { maxRequests: MAX_RECHECK_PACKAGES },
    userAgent,
  });

/** The most API requests one key or user may make in a minute. */
export const apiRatePerMinute: number = API_RATE_PER_MINUTE;

/**
 * Users' tokens, for the API: a token is given to Better Auth as the only header, a bearer's, so that no cookie can
 * stand in for it; the session found is its user's, the admin viewing the site as them marked.
 */
export const apiUsers: ApiUsers = {
  async userOf(token) {
    const found = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
    if (found === null) return undefined;
    const { user, session } = found;
    return {
      id: user.id,
      handle: user.handle,
      nickname: user.nickname ?? null,
      role: isAdmin(user, adminUserIds) ? 'admin' : 'user',
      impersonated: typeof session.impersonatedBy === 'string',
      sessionId: session.id,
    };
  },
  entitlement: cachedEntitlements(subscribedBy(subscriptions, patreon), user => user.role === 'admin'),
};
