import { API_VERSION, StatusResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { endpoint } from '#lib/server/http/endpoint.js';
import { respond } from '#lib/server/http/respond.js';

import type { RequestHandler } from './$types';

/** What the catalogue holds. */
export const GET: RequestHandler = endpoint(async ({ locals }) => {
  const { packages, releases, asOf } = await locals.store.status();
  return respond(StatusResponse, {
    apiVersion: API_VERSION,
    version: __CATALOGUE_VERSION__,
    packages,
    releases,
    asOf: asOf?.toISOString() ?? null,
  });
});
