/**
 * The accounts' internal API, served from an {@link Accounts}: a request handler of the web's own `Request` and
 * `Response`, for any server, such as a SvelteKit endpoint, to hand its requests under {@link INTERNAL_API_ROOT} to.
 *
 * Each endpoint takes a POST of JSON, with an application's key in {@link INTERNAL_KEY_HEADER}; the key is compared
 * in constant time. A request it cannot read is refused as a bad request, never passed on.
 */
import {
  INTERNAL_KEY_HEADER,
  INTERNAL_PATHS,
  entitlementRequest,
  entitlementSchema,
  sessionUserRequest,
  tokenUserRequest,
  useRequest,
  userResponse,
} from './index.js';

import type { Accounts, AccountUser } from './index.js';
import type { z } from 'zod';

/** What the internal API is served with. */
export interface InternalApiOptions {
  /** The keys of the applications that may call it; several, so that a key can be rotated. */
  readonly keys: readonly string[];
}

/** A key's and a given value's equality, in a time that tells nothing of where they differ. */
function sameKey(given: string, key: string): boolean {
  let difference = given.length ^ key.length;
  for (let index = 0; index < key.length; index++) {
    difference |= (given.charCodeAt(index) || 0) ^ key.charCodeAt(index);
  }
  return difference === 0;
}

/** An error answer, as JSON. */
const refuse = (status: number, error: string) => Response.json({ error }, { status });

/** A user, as the API sends one: dates and all, as JSON. */
const sendUser = (user: AccountUser | undefined) => Response.json(userResponse.encode({ user: user ?? null }));

/**
 * The internal API's handler.
 *
 * @param accounts - The accounts it serves
 * @param options - Who may call it
 * @returns A handler of its requests: anything else under its root is not found
 */
export function internalApi(accounts: Accounts, { keys }: InternalApiOptions): (request: Request) => Promise<Response> {
  if (keys.length === 0) throw new Error('The internal API needs at least one key');

  /** The request's body, read by a schema, or undefined if it is not that. */
  async function bodyOf<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S> | undefined> {
    try {
      const parsed = schema.safeParse(await request.json());
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  return async request => {
    const { pathname } = new URL(request.url);
    const given = request.headers.get(INTERNAL_KEY_HEADER) ?? '';
    // Every key is compared, so that the time says nothing of which matched.
    if (!keys.map(key => sameKey(given, key)).includes(true)) return refuse(401, 'unauthorised');
    if (!(Object.values(INTERNAL_PATHS) as string[]).includes(pathname)) return refuse(404, 'not-found');
    if (request.method !== 'POST') return refuse(405, 'method-not-allowed');

    switch (pathname) {
      case INTERNAL_PATHS.tokenUser: {
        const body = await bodyOf(request, tokenUserRequest);
        return body === undefined ? refuse(400, 'bad-request') : sendUser(await accounts.userOf(body.token));
      }
      case INTERNAL_PATHS.sessionUser: {
        const body = await bodyOf(request, sessionUserRequest);
        return body === undefined ? refuse(400, 'bad-request') : sendUser(await accounts.userOfSession(body.cookie));
      }
      case INTERNAL_PATHS.entitlement: {
        const body = await bodyOf(request, entitlementRequest);
        if (body === undefined) return refuse(400, 'bad-request');
        return Response.json(entitlementSchema.encode(await accounts.entitlement(body.user)));
      }
      default: {
        const body = await bodyOf(request, useRequest);
        if (body === undefined) return refuse(400, 'bad-request');
        await accounts.used(body.user, body.use);
        return new Response(null, { status: 204 });
      }
    }
  };
}
