import { internal } from '#lib/server/runtime.js';

import type { RequestHandler } from './$types';

/**
 * The internal API (see `@mondarth/accounts-contract/server`): the other applications' requests, on the deployment's
 * own network, with their keys. It answers every method, refusing all but its own.
 */
export const fallback: RequestHandler = ({ request }) => internal(request);
