import { z } from 'zod';

import { cachedJson } from '#lib/server/http/cache.js';
import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError } from '#lib/server/http/respond.js';
import { LISTING_MAX_AGE, listingOf } from '#lib/server/listing.js';

import type { RequestHandler } from './$types';

/** `?type=module` or `?type=system`, or neither, for both. */
const ListingQuery = z.enum(['module', 'system']).optional();

/** Every package Foundry VTT's listing offers, as the catalogue keeps it. */
export const GET: RequestHandler = endpoint(async ({ request, url, locals }) => {
  const type = ListingQuery.safeParse(url.searchParams.get('type') ?? undefined);
  if (!type.success) return apiError('bad-request', 'type is module or system', locals.requestId);
  const { etag, body } = await listingOf(locals.store, type.data);
  return cachedJson(etag, request, body, LISTING_MAX_AGE);
});
