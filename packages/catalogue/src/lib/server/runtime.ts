/**
 * The server's long-lived parts, made once when it starts: the connection pool, the store, the logger, and the client
 * that requests which fetch, such as rechecks, fetch with.
 */
import { MAX_RECHECK_PACKAGES } from '@mondarth/fvtt-package-catalogue-contract';
import { httpClient } from '@mondarth/fvtt-resolver/sources';

import { API_KEYS, DATABASE_URL, LOG_LEVEL } from '$app/env/private';

import { connect } from './db/connect.js';
import { createLogger } from './log.js';
import { lruCache, versionsOnly } from './lru-cache.js';
import { drizzleStore } from './store/drizzle.js';

export const log = createLogger({ level: LOG_LEVEL });
export const connection = connect(DATABASE_URL);
export const store = drizzleStore(connection.db);
export const apiKeys = API_KEYS;

// The versions of packages' own manifests rechecked, so that each is revalidated by its ETag, as the worker's are.
const versions = versionsOnly(lruCache(5000));

/** A client for one request, as many requests as packages a recheck may ask for, through the server's own cache. */
export const http = () =>
  httpClient({
    fetch: globalThis.fetch,
    cache: versions,
    budget: { maxRequests: MAX_RECHECK_PACKAGES },
    userAgent: `fvtt-package-catalogue/${__CATALOGUE_VERSION__} (+https://github.com/Mondarth/fvtt-package-catalogue)`,
  });
