import { UniverseRequest, UniverseResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { z } from 'zod';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';
import { gatherUniverse } from '#lib/server/universe.js';

import type { RequestHandler } from './$types';

/** A set of packages and everything they need. */
export const POST: RequestHandler = endpoint(async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('bad-request', 'The body is not JSON', locals.requestId);
  }
  const asked = UniverseRequest.safeParse(body);
  if (!asked.success) return apiError('bad-request', z.prettifyError(asked.error), locals.requestId);
  const found = await gatherUniverse(locals.store, asked.data.packages);
  return respond(UniverseResponse, { ...found, asOf: found.asOf?.toISOString() ?? null });
});
