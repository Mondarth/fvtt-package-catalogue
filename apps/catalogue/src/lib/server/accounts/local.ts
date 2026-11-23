/**
 * The accounts as the catalogue's API uses them ({@link Accounts}), served in the catalogue's own process, from its own
 * tables: who a token, or the website's cookie, is for, by Better Auth's sessions; what their subscription entitles
 * them to; and their use of the API, kept as their last session and recorded while a payment of theirs is disputed.
 *
 * The API depends on the contract alone, so that once the accounts are an application of their own, this gives way to
 * a client of their internal API, and nothing else changes.
 */
import type { Accounts, AccountUser, Entitlement } from '@mondarth/accounts-contract';

import type { AccessRecorder } from './access.js';

/** A session Better Auth finds by its token, as much of it as the accounts tell. */
export interface FoundSession {
  readonly user: {
    readonly id: string;
    readonly handle: string;
    readonly nickname?: string | null | undefined;
    readonly role?: string | null | undefined;
  };
  readonly session: { readonly id: string; readonly impersonatedBy?: string | null | undefined };
}

/** What the accounts are served from. */
export interface LocalAccountsOptions {
  /**
   * The session a request's headers are for, if any: Better Auth's, given a bearer token, or the cookies, as the only
   * header, so that neither can stand in for the other.
   */
  readonly sessionOf: (headers: Headers) => Promise<FoundSession | null>;
  /** Whether a user is an admin: by their role, or as `ADMIN_USER_IDS` names them. */
  readonly isAdmin: (user: FoundSession['user']) => boolean;
  /** What a user's subscription entitles them to, an admin always. */
  readonly entitlement: (user: AccountUser) => Promise<Entitlement>;
  /** Users' last sessions, and their access while a payment of theirs is disputed. */
  readonly access: Pick<AccessRecorder, 'seen' | 'record'>;
}

/**
 * The accounts, served in this process.
 *
 * @param options - What they are served from
 * @returns The accounts
 */
export function localAccounts({ sessionOf, isAdmin, entitlement, access }: LocalAccountsOptions): Accounts {
  /** The user a session is for, as the accounts tell it. */
  async function userBy(headers: Headers): Promise<AccountUser | undefined> {
    const found = await sessionOf(headers);
    if (found === null) return undefined;
    const { user, session } = found;
    return {
      id: user.id,
      handle: user.handle,
      nickname: user.nickname ?? null,
      role: isAdmin(user) ? 'admin' : 'user',
      impersonated: typeof session.impersonatedBy === 'string',
      sessionId: session.id,
    };
  }

  return {
    userOf: token => userBy(new Headers({ authorization: `Bearer ${token}` })),
    userOfSession: cookie => userBy(new Headers({ cookie })),
    entitlement,
    async used(user, use) {
      // An admin viewing the site as a user is not the user using it.
      if (user.impersonated) return;
      if (user.sessionId !== undefined) await access.seen(user.id, user.sessionId, use);
      await access.record(user.id, use);
    },
  };
}
