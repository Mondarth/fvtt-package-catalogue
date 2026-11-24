/**
 * Who is signed in to the catalogue's website, as the accounts tell it by the request's cookies: Mondarth's one
 * session cookie, shared by every application's subdomain. Should the accounts not answer, the page is shown as to
 * someone not signed in, and the failure logged: the catalogue's pages need no one signed in.
 */
import type { Accounts } from '@mondarth/accounts-contract';

import type { Logger } from './log.js';

/** Who is signed in, as the pages show them. */
export interface SignedIn {
  /** The name they are shown by: their nickname, or else their handle. */
  readonly name: string;
  readonly admin: boolean;
  /** Whether an admin is viewing the site as them. */
  readonly impersonated: boolean;
}

/**
 * Who is signed in, if anyone.
 *
 * @param accounts - The accounts, if the catalogue has them
 * @param cookie - The request's `Cookie` header, if any
 * @param log - Where a failure to ask is logged
 * @returns Who, or null
 */
export async function signedInBy(
  accounts: Accounts | undefined,
  cookie: string | null,
  log: Logger,
): Promise<SignedIn | null> {
  if (accounts === undefined || cookie === null || cookie === '') return null;
  try {
    const user = await accounts.userOfSession(cookie);
    if (user === undefined) return null;
    return { name: user.nickname ?? user.handle, admin: user.role === 'admin', impersonated: user.impersonated };
  } catch (error) {
    log.warn('The accounts could not say who is signed in', { error });
    return null;
  }
}
