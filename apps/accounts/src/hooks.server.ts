import { sequence } from '@sveltejs/kit/hooks';

import { createAccountsHandle } from '#lib/server/accounts/handle.js';
import { createRequestHandle } from '#lib/server/http/request.js';
import { handleI18n } from '#lib/server/i18n.js';
import {
  access,
  accounts,
  adminUserIds,
  appOrigins,
  audit,
  auth,
  banNotices,
  log,
  patreon,
  providers,
  stripe,
  subscriptions,
} from '#lib/server/runtime.js';

import type { HandleServerError } from '@sveltejs/kit/hooks';

/** Request ids, logging and a device's CORS first; then signing in, and the website's localisation. */
export const handle = sequence(
  createRequestHandle({ log }),
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
    appOrigins,
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
