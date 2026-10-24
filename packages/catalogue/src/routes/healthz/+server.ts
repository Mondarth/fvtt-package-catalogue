import { HealthResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { respond } from '#lib/server/http/respond.js';

import type { RequestHandler } from './$types';

/** The server is up. For the container's health check: it needs no key and asks nothing of the database. */
export const GET: RequestHandler = () =>
  respond(HealthResponse, { status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
