/**
 * The server's request handling, before any route: request ids, logging, CORS and API keys.
 */
import { API_KEY_HEADER, CLIENT_HEADER } from '@mondarth/fvtt-package-catalogue-contract';
import type { Handle } from '@sveltejs/kit/hooks';

import type { ErrorCode } from '@mondarth/fvtt-package-catalogue-contract';

import { keyMatcher } from './auth.js';
import { isApiPath } from './paths.js';
import { apiError } from './respond.js';

import type { Logger } from '../log.js';
import type { CatalogueStore } from '../store/types.js';

/** What the `handle` hook works with. */
export interface HandleOptions {
  readonly store: CatalogueStore;
  readonly apiKeys: readonly string[];
  readonly log: Logger;
  /** A new request id; a random UUID by default. */
  readonly requestId?: () => string;
  /** Milliseconds since some fixed point, for timing requests; `performance.now` by default. */
  readonly clock?: () => number;
}

/**
 * Any origin may call the API: Foundry VTT runs wherever its users host it. The key, not the origin, says who is
 * calling.
 */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': `${API_KEY_HEADER}, ${CLIENT_HEADER}, Content-Type`,
  'Access-Control-Max-Age': '86400',
};

/** A response with the CORS headers added. A response from `fetch` has immutable headers, so it is copied. */
function withCors(response: Response): Response {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS_HEADERS)) copy.headers.set(name, value);
  return copy;
}

/** The contract's error for a status SvelteKit answered with. */
function codeFor(status: number): ErrorCode {
  if (status === 404) return 'not-found';
  if (status === 405) return 'method-not-allowed';
  return status < 500 ? 'bad-request' : 'internal';
}

/**
 * An API response in the contract's shape. The endpoints answer in it themselves; what SvelteKit answers for them, such
 * as its 404 for a path no route matches, is HTML, so it is replaced by the contract's error.
 */
function inContract(response: Response, requestId: string): Response {
  if (response.ok || response.headers.get('Content-Type')?.startsWith('application/json') === true) return response;
  return apiError(codeFor(response.status), `The API answered ${String(response.status)}`, requestId);
}

/**
 * The server's `handle` hook.
 *
 * @param options - The store, the keys accepted and the logger
 * @returns The hook
 */
export function createHandle({
  store,
  apiKeys,
  log,
  requestId = () => crypto.randomUUID(),
  clock = () => performance.now(),
}: HandleOptions): Handle {
  const isKey = keyMatcher(apiKeys);

  return async ({ event, resolve }) => {
    const id = requestId();
    const started = clock();
    event.locals.requestId = id;
    event.locals.store = store;
    event.locals.log = log.child({ requestId: id });

    const { pathname } = event.url;
    let response: Response;
    if (!isApiPath(pathname)) {
      response = await resolve(event);
    } else if (event.request.method === 'OPTIONS') {
      // The CORS preflight carries no key.
      response = withCors(new Response(null, { status: 204 }));
    } else if (!isKey(event.request.headers.get(API_KEY_HEADER))) {
      response = withCors(apiError('unauthorised', `A valid ${API_KEY_HEADER} header is needed`, id));
    } else {
      response = withCors(inContract(await resolve(event), id));
    }

    event.locals.log.info('request', {
      method: event.request.method,
      path: pathname,
      status: response.status,
      ms: Math.round(clock() - started),
      client: event.request.headers.get(CLIENT_HEADER) ?? undefined,
    });
    return response;
  };
}
