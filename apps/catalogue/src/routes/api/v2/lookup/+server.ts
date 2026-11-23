import { LookupRequest, LookupResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { z } from 'zod';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';
import { lookUp } from '#lib/server/lookup.js';

import type { RequestHandler } from './$types';

/** A set of packages, everything they need, and how fresh each is. */
export const POST: RequestHandler = endpoint(async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('bad-request', 'The body is not JSON', locals.requestId);
  }
  const asked = LookupRequest.safeParse(body);
  if (!asked.success) return apiError('bad-request', z.prettifyError(asked.error), locals.requestId);
  return respond(LookupResponse, await lookUp(locals.store, asked.data));
});
