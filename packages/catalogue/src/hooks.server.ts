import { sequence } from '@sveltejs/kit/hooks';

import { createHandle } from '#lib/server/http/handle.js';
import { handleI18n } from '#lib/server/http/i18n.js';
import { apiKeys, log, store } from '#lib/server/runtime.js';

import type { HandleServerError } from '@sveltejs/kit/hooks';

/** Request ids, logging, CORS and keys first; then the website's localisation. */
export const handle = sequence(createHandle({ store, apiKeys, log }), handleI18n);

/** SvelteKit's own errors, such as a 404, are expected; anything else is logged. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'framework') event.locals.log.error('Unexpected error', { kind, error, path: event.url.pathname });
};
