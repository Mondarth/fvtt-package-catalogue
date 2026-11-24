import { sequence } from '@sveltejs/kit/hooks';

import { createHandle } from '#lib/server/http/handle.js';
import { handleI18n } from '#lib/server/http/i18n.js';
import { createMovedHandle } from '#lib/server/http/moved.js';
import {
  accounts,
  accountsSite,
  accountsUrl,
  apiKeys,
  apiRatePerMinute,
  fetchGiven,
  http,
  log,
  store,
} from '#lib/server/runtime.js';

import type { HandleServerError } from '@sveltejs/kit/hooks';

/** Request ids, logging, CORS and keys first; then what moved to the accounts, and the website's localisation. */
export const handle = sequence(
  createHandle({ store, apiKeys, accounts, ratePerMinute: apiRatePerMinute, log, http, fetchGiven }),
  createMovedHandle({ accountsUrl, accountsSiteUrl: accountsSite }),
  handleI18n,
);

/**
 * Only what is unexpected is logged: thrown by the website's code, or code it calls. SvelteKit's own errors, such as a
 * 404, and the website's own, thrown with `error()`, are answers it means.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind === 'unknown') event.locals.log.error('Unexpected error', { kind, error, path: event.url.pathname });
};
