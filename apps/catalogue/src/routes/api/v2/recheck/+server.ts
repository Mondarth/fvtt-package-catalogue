import { RecheckRequest, RecheckResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { z } from 'zod';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';
import { recheck } from '#lib/server/recheck.js';

import type { RequestHandler } from './$types';

/** Packages' own manifests, checked again now. */
export const POST: RequestHandler = endpoint(async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('bad-request', 'The body is not JSON', locals.requestId);
  }
  const asked = RecheckRequest.safeParse(body);
  if (!asked.success) return apiError('bad-request', z.prettifyError(asked.error), locals.requestId);
  return respond(
    RecheckResponse,
    await recheck(locals.store, asked.data.packages, { http: locals.http(), now: new Date() }),
  );
});
