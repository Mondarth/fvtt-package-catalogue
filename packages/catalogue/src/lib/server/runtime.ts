/**
 * The server's long-lived parts, made once when it starts: the connection pool, the store, the logger, and the client
 * that requests which fetch, such as rechecks, fetch with.
 */
import { MAX_RECHECK_PACKAGES } from '@mondarth/fvtt-package-catalogue-contract';
import { httpClient } from '@mondarth/fvtt-resolver/sources';

import {
  API_KEYS,
  AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET,
  AUTH_SECRET,
  AUTH_TEST_PROVIDER_URL,
  DATABASE_URL,
  LOG_LEVEL,
  SITE_URL,
} from '$app/env/private';

import { createAuth, signInProviders } from './accounts/auth.js';
import { testProviderUrl } from './accounts/dev-provider.js';
import { accountsStore } from './accounts/store.js';

import { connect } from './db/connect.js';
import { createLogger } from './log.js';
import { lruCache, versionsOnly } from './lru-cache.js';
import { safeFetch } from './safe-fetch.js';
import { drizzleStore } from './store/drizzle.js';

export const log = createLogger({ level: LOG_LEVEL });
export const connection = connect(DATABASE_URL);
export const store = drizzleStore(connection.db);
export const apiKeys = API_KEYS;

/** GitHub's app, where both its id and secret are set. */
const github =
  AUTH_GITHUB_ID !== undefined && AUTH_GITHUB_SECRET !== undefined
    ? { clientId: AUTH_GITHUB_ID, clientSecret: AUTH_GITHUB_SECRET }
    : undefined;

/** The stand-in provider: the one the end-to-end tests run, or, on the development server, its own (dev-provider.ts). */
const testProvider = testProviderUrl(AUTH_TEST_PROVIDER_URL, SITE_URL, import.meta.env.DEV);

/** Signing in to the website. */
export const auth = createAuth({
  db: connection.db,
  secret: AUTH_SECRET,
  siteUrl: SITE_URL,
  github,
  testProviderUrl: testProvider,
});

/** The accounts' tables, beyond what Better Auth does itself. */
export const accounts = accountsStore(connection.db);

/** The providers the sign-in page offers. */
export const providers = signInProviders({ github, testProviderUrl: testProvider });

// The versions of packages' own manifests rechecked, so that each is revalidated by its ETag, as the worker's are.
const versions = versionsOnly(lruCache(5000));

const userAgent = `fvtt-package-catalogue/${__CATALOGUE_VERSION__} (+https://github.com/Mondarth/fvtt-package-catalogue)`;

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
