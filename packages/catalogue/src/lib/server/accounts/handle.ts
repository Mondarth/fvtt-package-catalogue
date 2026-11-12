/**
 * The `handle` hook of signing in: Better Auth answers its own paths, under `/auth`, and every page of the website is
 * given who is signed in, if anyone is. The API and the health check are passed through untouched: they are not signed
 * in to.
 */
import type { Handle } from '@sveltejs/kit/hooks';

import { isSitePath } from '../http/paths.js';
import { AUTH_PATH } from './auth.js';

import type { Auth } from './auth.js';
import type { AccountsStore } from './store.js';

/**
 * Whether a path is Better Auth's.
 *
 * @param pathname - The request's path
 * @returns Whether it is under {@link AUTH_PATH}
 */
export function isAuthPath(pathname: string): boolean {
  return pathname === AUTH_PATH || pathname.startsWith(`${AUTH_PATH}/`);
}

/**
 * The hook.
 *
 * @param auth - Better Auth, as the website uses it
 * @param accounts - The accounts' tables
 * @param providers - The providers the sign-in page offers
 * @returns The hook
 */
export function createAccountsHandle(auth: Auth, accounts: AccountsStore, providers: readonly string[]): Handle {
  return async ({ event, resolve }) => {
    // No one, until the session says otherwise: an API request's error page, such as its 404, renders the website's
    // layout, which reads them.
    event.locals.user = null;
    event.locals.session = null;
    const { pathname } = event.url;
    if (isAuthPath(pathname)) return auth.handler(event.request);
    if (!isSitePath(pathname)) return resolve(event);

    event.locals.auth = auth;
    event.locals.accounts = accounts;
    event.locals.providers = providers;
    // Reading the session may renew it, which sets its cookie again.
    const { headers, response: found } = await auth.api.getSession({
      headers: event.request.headers,
      returnHeaders: true,
    });
    event.locals.user = found?.user ?? null;
    event.locals.session = found?.session ?? null;
    const response = await resolve(event);
    for (const cookie of headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
    return response;
  };
}
