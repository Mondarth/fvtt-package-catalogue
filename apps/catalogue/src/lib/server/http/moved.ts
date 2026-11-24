/**
 * What moved from the catalogue to the accounts, which are now an application of their own: signing in, the profile,
 * subscriptions and payments, the privacy page, the admin pages, and Stripe's webhook.
 *
 * Their old addresses go on working while what calls them catches up:
 *
 * - a page, and any of Better Auth's endpoints (`/auth/*`), such as a provider's callback still registered at the
 *   catalogue, is redirected to the same path at the accounts, keeping its method and body (307 or 308);
 * - what follows no redirect is passed on to the accounts, on the deployment's own network, and their answer given
 *   back: Stripe's webhook, which Stripe posts once, and the two endpoints a device signing in calls, which EMMA's
 *   browser extension posts from its own origin, with the CORS that lets it, until it signs in at the accounts.
 */
import type { Handle } from '@sveltejs/kit/hooks';

/** The pages, and their subpaths, that moved to the accounts. */
export const MOVED_PAGES: readonly string[] = [
  '/admin',
  '/auth',
  '/device',
  '/impersonation',
  '/privacy',
  '/profile',
  '/sign-in',
  '/sign-out',
  '/subscription',
];

/** What is passed on to the accounts, never redirected. */
export const PASSED_ON: ReadonlySet<string> = new Set(['/webhooks/stripe', '/auth/device/code', '/auth/device/token']);

/** The CORS headers of a device's endpoints, as the accounts give them. */
export const DEVICE_CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** The request headers passed on: what the accounts read of these requests, and nothing of the visitor's else. */
const PASSED_HEADERS = ['content-type', 'stripe-signature', 'user-agent', 'x-forwarded-for'] as const;

/**
 * Whether a path moved to the accounts.
 *
 * @param pathname - The request's path
 * @returns Whether it is a moved page, or under one
 */
export function hasMoved(pathname: string): boolean {
  return PASSED_ON.has(pathname) || MOVED_PAGES.some(page => pathname === page || pathname.startsWith(`${page}/`));
}

/** Where the moved paths go. */
export interface MovedOptions {
  /** The accounts' address on the deployment's network, which what is passed on is sent to. */
  readonly accountsUrl: string;
  /** The accounts' address as visitors reach it, which the pages are redirected to. */
  readonly accountsSiteUrl: string;
  /** Fetches; the global `fetch` by default. */
  readonly fetch?: typeof fetch;
}

/**
 * The `handle` hook that sends what moved to the accounts.
 *
 * @param options - Where it goes
 * @returns The hook
 */
export function createMovedHandle({ accountsUrl, accountsSiteUrl, fetch: fetching = fetch }: MovedOptions): Handle {
  return async ({ event, resolve }) => {
    event.locals.accountsSite = accountsSiteUrl;
    const { pathname, search } = event.url;
    if (!hasMoved(pathname)) return resolve(event);
    const device = pathname.startsWith('/auth/device/');
    if (PASSED_ON.has(pathname)) {
      if (event.request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), device);
      const headers = new Headers();
      for (const name of PASSED_HEADERS) {
        const value = event.request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      try {
        const answer = await fetching(`${accountsUrl}${pathname}${search}`, {
          method: event.request.method,
          headers,
          // Passed on as it came: Stripe signs the body's very bytes.
          body:
            event.request.method === 'GET' || event.request.method === 'HEAD'
              ? null
              : await event.request.arrayBuffer(),
          redirect: 'manual',
        });
        return cors(new Response(answer.body, { status: answer.status, headers: answer.headers }), device);
      } catch (error) {
        event.locals.log.error('The accounts could not be reached', { path: pathname, error });
        return cors(Response.json({ error: 'accounts-unavailable' }, { status: 502 }), device);
      }
    }
    // A GET or HEAD is moved for good; anything else, such as a form's POST, is sent on as it is.
    const status = event.request.method === 'GET' || event.request.method === 'HEAD' ? 308 : 307;
    return new Response(null, { status, headers: { Location: `${accountsSiteUrl}${pathname}${search}` } });
  };
}

/** A response with a device's CORS headers, where it is a device's; copied, as `fetch`'s headers are immutable. */
function cors(response: Response, device: boolean): Response {
  if (!device) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(DEVICE_CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}
