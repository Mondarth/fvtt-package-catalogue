/**
 * The `handle` hook of signing in: Better Auth answers its own paths, under `/auth`, and every page of the website is
 * given who is signed in, if anyone is. The API and the health check are passed through untouched: they are not signed
 * in to.
 */
import type { Handle } from '@sveltejs/kit/hooks';

import { isSitePath } from '../http/paths.js';
import { AUTH_PATH } from './auth.js';
import { entitlementOf } from '../subscriptions/entitlement.js';
import { isAdmin } from './permissions.js';

import type { AuditStore } from './audit.js';
import type { BanNotices } from './ban-notice.js';
import type { SubscriptionStore } from '../subscriptions/store.js';
import type { Auth } from './auth.js';
import type { AccountsStore } from './store.js';

/** What the website's pages are given besides signing in. */
export interface AccountsHandleOptions {
  readonly accounts: AccountsStore;
  /** The providers the sign-in page offers. */
  readonly providers: readonly string[];
  readonly audit: AuditStore;
  /** The users who are admins whatever their role (`ADMIN_USER_IDS`). */
  readonly adminUserIds: readonly string[];
  /** Reads the notice a banned user's sign-in comes back with. */
  readonly banNotices: BanNotices;
  readonly subscriptions: SubscriptionStore;
}

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
 * @param options - The accounts' tables, the providers offered, the audit log and the admins named
 * @returns The hook
 */
export function createAccountsHandle(auth: Auth, options: AccountsHandleOptions): Handle {
  const { accounts, providers, audit, adminUserIds, banNotices, subscriptions } = options;
  return async ({ event, resolve }) => {
    // No one, until the session says otherwise: an API request's error page, such as its 404, renders the website's
    // layout, which reads them.
    event.locals.user = null;
    event.locals.session = null;
    event.locals.isAdmin = false;
    const { pathname } = event.url;
    if (isAuthPath(pathname)) return auth.handler(event.request);
    if (!isSitePath(pathname)) return resolve(event);

    event.locals.auth = auth;
    event.locals.accounts = accounts;
    event.locals.providers = providers;
    event.locals.audit = audit;
    event.locals.adminUserIds = adminUserIds;
    event.locals.banNotices = banNotices;
    event.locals.subscriptions = subscriptions;
    // Reading the session may renew it, which sets its cookie again.
    const { headers, response: found } = await auth.api.getSession({
      headers: event.request.headers,
      returnHeaders: true,
    });
    event.locals.user = found?.user ?? null;
    event.locals.session = found?.session ?? null;
    event.locals.isAdmin = found !== null && isAdmin(found.user, adminUserIds);
    event.locals.entitlement = entitlementOf(subscriptions, found?.user.id, event.locals.isAdmin);
    const response = await resolve(event);
    for (const cookie of headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
    return response;
  };
}
