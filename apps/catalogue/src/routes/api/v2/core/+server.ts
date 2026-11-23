import { cachedJson } from '#lib/server/http/cache.js';
import { endpoint } from '#lib/server/http/endpoint.js';
import { CORE_MAX_AGE, coreOf } from '#lib/server/listing.js';

import type { RequestHandler } from './$types';

/** Foundry VTT's builds. */
export const GET: RequestHandler = endpoint(async ({ request, locals }) => {
  const { etag, body } = await coreOf(locals.store);
  return cachedJson(etag, request, () => Promise.resolve(body), CORE_MAX_AGE);
});
