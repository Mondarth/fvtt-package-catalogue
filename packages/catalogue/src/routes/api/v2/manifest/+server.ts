import { ManifestRequest, ManifestResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { z } from 'zod';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';
import { readManifest } from '#lib/server/manifest-read.js';

import type { RequestHandler } from './$types';

/** A manifest URL a user gives, read. */
export const POST: RequestHandler = endpoint(async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('bad-request', 'The body is not JSON', locals.requestId);
  }
  const asked = ManifestRequest.safeParse(body);
  if (!asked.success) return apiError('bad-request', z.prettifyError(asked.error), locals.requestId);
  return respond(ManifestResponse, await readManifest(locals.store, asked.data, locals.fetchGiven));
});
