/**
 * The accounts' server, wired to its environment: the database, signing in, subscriptions and payments, and the
 * accounts as the other applications reach them over the internal API. Read once, as the server starts.
 */
import {
  ADMIN_USER_IDS,
  APP_ORIGINS,
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
  COOKIE_DOMAIN,
  DATABASE_URL,
  INTERNAL_API_KEYS,
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
import { internalApi } from '@mondarth/accounts-contract/server';

import { accessRecorder } from './accounts/access.js';
import { auditStore } from './accounts/audit.js';
import { createAuth, providerApp, signInProviders } from './accounts/auth.js';
import { banNotices as signedBanNotices } from './accounts/ban-notice.js';
import { devPatreon } from './accounts/dev-patreon.js';
import { testProviderUrl } from './accounts/dev-provider.js';
import { localAccounts } from './accounts/local.js';
import { knownIdentitiesOf } from './accounts/identities.js';
import { isAdmin } from './accounts/permissions.js';
import { accountsStore } from './accounts/store.js';
import { connect } from './db/connect.js';
import { createLogger } from './log.js';
import { cachedEntitlements, subscribedBy } from './subscriptions/entitlement.js';
import { patreonChecker } from './subscriptions/patreon.js';
import { stripeGateway } from './subscriptions/stripe.js';
import { subscriptionStore } from './subscriptions/store.js';

export const log = createLogger({ level: LOG_LEVEL });
export const connection = connect(DATABASE_URL);

const patreonSetting = devPatreon(
  { app: providerApp(AUTH_PATREON_ID, AUTH_PATREON_SECRET), url: PATREON_URL, campaignId: PATREON_CAMPAIGN_ID },
  SITE_URL,
  import.meta.env.DEV,
);

const apps = {
  github: providerApp(AUTH_GITHUB_ID, AUTH_GITHUB_SECRET),
  google: providerApp(AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET),
  discord: providerApp(AUTH_DISCORD_ID, AUTH_DISCORD_SECRET),
  patreon: patreonSetting.app,
};

const testProvider = testProviderUrl(AUTH_TEST_PROVIDER_URL, SITE_URL, import.meta.env.DEV);

/** Users' last sessions, and their access while a payment of theirs is disputed. */
export const access = accessRecorder(connection.db);

/** What admins have done. */
export const audit = auditStore(connection.db);

/** The users who are admins whatever their role. */
export const adminUserIds: readonly string[] = ADMIN_USER_IDS;

/** The other applications' origins, which a visitor may be sent back to once signed in. */
export const appOrigins: readonly string[] = APP_ORIGINS;

/** The identities every account was known by, against abuse, keyed by `AUTH_SECRET`. */
export const identities = knownIdentitiesOf(connection.db, AUTH_SECRET);

/** Reads the notice a banned user's sign-in comes back with. */
export const banNotices = signedBanNotices(AUTH_SECRET);

/** Signing in. */
export const auth = createAuth({
  db: connection.db,
  secret: AUTH_SECRET,
  siteUrl: SITE_URL,
  cookieDomain: COOKIE_DOMAIN,
  appOrigins,
  ...apps,
  testProviderUrl: testProvider,
  patreonUrl: patreonSetting.url,
  adminUserIds,
  audit,
  identities,
});

/** Patreon, if it is a way to be subscribed. */
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

/** Stripe, if subscription time is sold through it. */
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

/** Subscriptions. */
export const subscriptions = subscriptionStore(connection.db);

/** The accounts' tables. */
export const accounts = accountsStore(connection.db);

/** The providers the sign-in page offers. */
export const providers = signInProviders({ ...apps, testProviderUrl: testProvider });

/**
 * The internal API, serving the accounts as the other applications reach them: a token, or the cookies, are given to
 * Better Auth as the only header, so that neither can stand in for the other; the session found is its user's, the
 * admin viewing the site as them marked.
 */
export const internal = internalApi(
  localAccounts({
    sessionOf: headers => auth.api.getSession({ headers }),
    isAdmin: user => isAdmin(user, adminUserIds),
    entitlement: cachedEntitlements(subscribedBy(subscriptions, patreon), user => user.role === 'admin'),
    access,
    endSession: async headers => (await auth.api.signOut({ headers, asResponse: true })).headers.getSetCookie(),
  }),
  { keys: INTERNAL_API_KEYS },
);
