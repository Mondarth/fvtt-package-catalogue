/**
 * The accounts ({@link Accounts}), from their own tables, as the internal API serves them to the other applications:
 * who a token, or the website's cookie, is for, by Better Auth's sessions; what their subscription entitles them to;
 * their use of a service, kept as their last session and recorded while a payment of theirs is disputed; and signing out
 * of every Mondarth website, by the website's cookie.
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
  /** Ends the session the cookies are for, giving the `Set-Cookie` headers that clear them: Better Auth's sign-out. */
  readonly endSession: (headers: Headers) => Promise<readonly string[]>;
}

/**
 * The accounts, served in this process.
 *
 * @param options - What they are served from
 * @returns The accounts
 */
export function localAccounts({ sessionOf, isAdmin, entitlement, access, endSession }: LocalAccountsOptions): Accounts {
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
    async signOut(cookie) {
      const headers = new Headers({ cookie });
      // Cookies naming no session: nothing to end, and nothing to clear.
      if ((await sessionOf(headers)) === null) return [];
      return endSession(headers);
    },
  };
}
