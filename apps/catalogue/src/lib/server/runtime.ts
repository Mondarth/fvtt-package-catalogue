/**
 * The server's long-lived parts, made once when it starts: the connection pool, the store, the logger, and the client
 * that requests which fetch, such as rechecks, fetch with.
 */
import { MAX_RECHECK_PACKAGES } from '@mondarth/fvtt-package-catalogue-contract';
import { httpClient } from '@mondarth/fvtt-resolver/sources';

import {
  ACCOUNTS_KEY,
  ACCOUNTS_SITE_URL,
  ACCOUNTS_URL,
  API_KEYS,
  API_RATE_PER_MINUTE,
  DATABASE_URL,
  LOG_LEVEL,
} from '$app/env/private';

import { httpAccounts } from '@mondarth/accounts-contract/client';

import type { Accounts } from '@mondarth/accounts-contract';

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
/**
 * The accounts, reached over their internal API on the deployment's own network: who a user's token, or the website's
 * cookie, is for, what they are entitled to, and their use of the API.
 */
export const accounts: Accounts = httpAccounts({ url: ACCOUNTS_URL, key: ACCOUNTS_KEY });

/** The accounts' address on the deployment's network, which what moved there and follows no redirect is passed on to. */
export const accountsUrl: string = ACCOUNTS_URL;

/** The accounts' address as visitors reach it: where they sign in, and where the pages that moved there are. */
export const accountsSite: string = ACCOUNTS_SITE_URL;

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
