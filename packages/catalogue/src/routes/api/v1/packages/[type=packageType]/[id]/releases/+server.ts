import { PackageId, ReleasesResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';

import type { RequestHandler } from './$types';

/** Every release of a package the catalogue knows. */
export const GET: RequestHandler = endpoint(async ({ params, locals }) => {
  const id = PackageId.safeParse(params.id);
  if (!id.success) return apiError('bad-request', `Not a package id: ${params.id}`, locals.requestId);
  const ref = { type: params.type, id: id.data };
  const found = await locals.store.releasesOf(ref);
  if (found === undefined)
    return apiError('not-found', `The catalogue does not know ${params.type}:${id.data}`, locals.requestId);
  return respond(ReleasesResponse, {
    package: ref,
    releases: [...found.releases],
    asOf: found.asOf?.toISOString() ?? null,
  });
});
