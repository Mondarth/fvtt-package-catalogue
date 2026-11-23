/**
 * The accounts' request handling, before any route: request ids, logging, and the CORS of the two endpoints a device
 * signing in calls, such as EMMA's browser extension, which any origin may call: a browser extension's background
 * script asks from its own origin. Neither takes the website's cookie: a device asks for its codes, then polls for its
 * token, with the device code alone. Better Auth checks the origin of any request that does send a cookie.
 */
import type { Handle } from '@sveltejs/kit/hooks';

import { AUTH_PATH } from '../accounts/auth.js';
import { DEVICE_CODE_PATH, DEVICE_TOKEN_PATH } from '../accounts/device.js';

import type { Logger } from '../log.js';

/** The endpoints a device signing in calls, which any origin may call. */
export const DEVICE_CORS_PATHS: ReadonlySet<string> = new Set([
  `${AUTH_PATH}${DEVICE_CODE_PATH}`,
  `${AUTH_PATH}${DEVICE_TOKEN_PATH}`,
]);

/** The CORS headers of a device's endpoints: posts of JSON, and no credentials, as `*` allows none. */
export const DEVICE_CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** A response with CORS headers added. A response from `fetch` has immutable headers, so it is copied. */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(DEVICE_CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** What the request handling works with. */
export interface RequestHandleOptions {
  readonly log: Logger;
  /** A new request id; a random UUID by default. */
  readonly requestId?: () => string;
  /** Milliseconds since some fixed point, for timing requests; `performance.now` by default. */
  readonly clock?: () => number;
}

/**
 * The `handle` hook that gives each request its id and logger, logs it, and lets any origin call a device's endpoints.
 *
 * @param options - What it works with
 * @returns The hook
 */
export function createRequestHandle({
  log,
  requestId = () => crypto.randomUUID(),
  clock = () => performance.now(),
}: RequestHandleOptions): Handle {
  return async ({ event, resolve }) => {
    const id = requestId();
    const started = clock();
    event.locals.requestId = id;
    event.locals.log = log.child({ requestId: id });
    const { pathname } = event.url;
    let response: Response;
    if (DEVICE_CORS_PATHS.has(pathname)) {
      response = withCors(
        event.request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await resolve(event),
      );
    } else {
      response = await resolve(event);
    }
    event.locals.log.info('request', {
      method: event.request.method,
      path: pathname,
      status: response.status,
      ms: Math.round(clock() - started),
    });
    return response;
  };
}
