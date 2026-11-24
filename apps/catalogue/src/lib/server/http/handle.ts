/**
 * The server's request handling, before any route: request ids, logging, CORS, and who is asking the API, by its key or
 * its user's token, what they may reach (see `access.ts`), and how often.
 */
import {
  API_KEY_HEADER,
  AUTHORIZATION_HEADER,
  CLIENT_HEADER,
  ME_PATH,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { Handle } from '@sveltejs/kit/hooks';

import type { Accounts, AccountUser, Entitlement } from '@mondarth/accounts-contract';
import type { ErrorCode } from '@mondarth/fvtt-package-catalogue-contract';

import { bearerToken, keyReaches } from './access.js';
import { keyMatcher } from './auth.js';
import { addressOf } from './address.js';
import { isApiPath } from './paths.js';
import { apiError } from './respond.js';

import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { ApiKey, ApiKeyKind } from '../config.js';
import type { Logger } from '../log.js';
import type { SafeFetched } from '../safe-fetch.js';
import type { CatalogueStore } from '../store/types.js';

/** The user a token is for, as the API sees them: as the accounts tell it. */
export type ApiUser = AccountUser;

/** Who is asking the API: a key's kind, or a user, and whether they may use what a subscription gives. */
export type ApiCaller =
  { readonly kind: ApiKeyKind } | { readonly kind: 'user'; readonly user: ApiUser; readonly entitlement: Entitlement };

/** What the `handle` hook works with. */
export interface HandleOptions {
  readonly store: CatalogueStore;
  readonly apiKeys: readonly ApiKey[];
  /**
   * The accounts: who a user's token is for, what they are entitled to, and their use of the API, which is recorded
   * against fraud while a payment of theirs is disputed. Without, the API takes keys alone.
   */
  readonly accounts?: Accounts | undefined;
  /** The most requests one key or user may make in a minute. */
  readonly ratePerMinute?: number | undefined;
  /** Milliseconds since the epoch, for the limit's minutes; `Date.now` by default. */
  readonly now?: () => number;
  readonly log: Logger;
  /** A client for a request that fetches, such as a recheck, with a budget of its own. */
  readonly http: () => HttpClient;
  /** Fetches a URL a client gave, refusing what only the server may reach. */
  readonly fetchGiven: (url: string) => Promise<SafeFetched>;
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
  // A client may revalidate what it keeps, such as the listing, by its ETag.
  'Access-Control-Allow-Headers': `${API_KEY_HEADER}, ${AUTHORIZATION_HEADER}, ${CLIENT_HEADER}, Content-Type, If-None-Match`,
  'Access-Control-Expose-Headers': 'ETag',
  'Access-Control-Max-Age': '86400',
};

/** A response with CORS headers added. A response from `fetch` has immutable headers, so it is copied. */
function withCors(response: Response, headers: Readonly<Record<string, string>> = CORS_HEADERS): Response {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
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
  // A 304 has no body: the client keeps what it had.
  const json = response.headers.get('Content-Type')?.startsWith('application/json') === true;
  if (response.ok || response.status === 304 || json) return response;
  return apiError(codeFor(response.status), `The API answered ${String(response.status)}`, requestId);
}

/**
 * A limit on how many requests each key or user makes, a minute at a time: each minute starts afresh.
 *
 * @param perMinute - How many each may make in a minute
 * @param now - The time now, in milliseconds since the epoch
 * @returns Whether one more may be made, by whose it is
 */
export function rateLimiter(perMinute: number, now: () => number): (who: string) => boolean {
  let minute = Number.NaN;
  const made = new Map<string, number>();
  return who => {
    const current = Math.floor(now() / 60_000);
    if (current !== minute) {
      minute = current;
      made.clear();
    }
    const count = (made.get(who) ?? 0) + 1;
    made.set(who, count);
    return count <= perMinute;
  };
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
  accounts,
  ratePerMinute = 300,
  now = Date.now,
  log,
  http,
  fetchGiven,
  requestId = () => crypto.randomUUID(),
  clock = () => performance.now(),
}: HandleOptions): Handle {
  const isKey = keyMatcher(apiKeys);
  const allowed = rateLimiter(ratePerMinute, now);

  /**
   * Who is asking, by their token or key, and whether they may call the endpoint: the caller, with whose requests the
   * limit counts them among, or the API's refusal.
   */
  async function callerOf(
    request: Request,
    pathname: string,
    id: string,
  ): Promise<{ caller: ApiCaller; who: string } | Response> {
    const authorization = request.headers.get(AUTHORIZATION_HEADER);
    if (authorization !== null) {
      const token = bearerToken(authorization);
      const user = token === undefined || accounts === undefined ? undefined : await accounts.userOf(token);
      if (user === undefined || accounts === undefined)
        return apiError('unauthorised', 'A valid bearer token is needed', id);
      if (user.impersonated) return apiError('forbidden', 'Not with a session an admin is viewing the site in', id);
      const entitlement = await accounts.entitlement(user);
      if (!entitlement.entitled && pathname !== ME_PATH) {
        return apiError('subscription-required', 'A subscription is needed', id, { paidUntil: entitlement.paidUntil });
      }
      return { caller: { kind: 'user', user, entitlement }, who: `user:${user.id}` };
    }
    const key = request.headers.get(API_KEY_HEADER);
    const kind = isKey(key);
    if (kind === undefined) return apiError('unauthorised', `A valid ${API_KEY_HEADER} header is needed`, id);
    if (!keyReaches(kind, pathname)) return apiError('forbidden', 'This key does not reach this endpoint', id);
    return { caller: { kind }, who: `key:${String(key)}` };
  }

  return async ({ event, resolve }) => {
    const id = requestId();
    const started = clock();
    event.locals.requestId = id;
    event.locals.store = store;
    event.locals.log = log.child({ requestId: id });
    event.locals.http = http;
    event.locals.fetchGiven = fetchGiven;
    if (accounts !== undefined) event.locals.accounts = accounts;

    const { pathname } = event.url;
    let response: Response;
    if (!isApiPath(pathname)) {
      response = await resolve(event);
    } else if (event.request.method === 'OPTIONS') {
      // The CORS preflight carries no key.
      response = withCors(new Response(null, { status: 204 }));
    } else {
      const asking = await callerOf(event.request, pathname, id);
      if (asking instanceof Response) {
        response = withCors(asking);
      } else {
        if (allowed(asking.who)) {
          event.locals.caller = asking.caller;
          // A signed-in user's use of the API, as the EMMA extension's lookups, told to the accounts. An admin's viewing
          // the site as them never gets this far.
          const { caller } = asking;
          if (accounts !== undefined && caller.kind === 'user') {
            await accounts.used(caller.user, {
              kind: 'api',
              path: pathname,
              client: event.request.headers.get(CLIENT_HEADER) ?? 'api',
              ipAddress: addressOf(event),
              userAgent: event.request.headers.get('user-agent'),
            });
          }
          response = withCors(inContract(await resolve(event), id));
        } else {
          response = withCors(apiError('rate-limited', 'Too many requests: try again in a minute', id));
        }
      }
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
