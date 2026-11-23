import { sequence } from '@sveltejs/kit/hooks';

import { createAccountsHandle } from '#lib/server/accounts/handle.js';
import { createHandle } from '#lib/server/http/handle.js';
import { handleI18n } from '#lib/server/http/i18n.js';
import {
  access,
  accounts,
  adminUserIds,
  apiKeys,
  apiRatePerMinute,
  apiAccounts,
  audit,
  auth,
  banNotices,
  fetchGiven,
  http,
  log,
  patreon,
  providers,
  store,
  stripe,
  subscriptions,
} from '#lib/server/runtime.js';

import type { HandleServerError } from '@sveltejs/kit/hooks';

/** Request ids, logging, CORS and keys first; then signing in, and the website's localisation. */
export const handle = sequence(
  createHandle({ store, apiKeys, accounts: apiAccounts, ratePerMinute: apiRatePerMinute, log, http, fetchGiven }),
  createAccountsHandle(auth, {
    accounts,
    providers,
    audit,
    adminUserIds,
    banNotices,
    subscriptions,
    patreon,
    stripe,
    access,
  }),
  handleI18n,
);

/**
 * Only what is unexpected is logged: thrown by the website's code, or code it calls. SvelteKit's own errors, such as a
 * 404, and the website's own, thrown with `error()`, such as the admin pages' 404 to anyone else, are answers it means.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind === 'unknown') event.locals.log.error('Unexpected error', { kind, error, path: event.url.pathname });
};
