/**
 * The accounts as the catalogue's API uses them ({@link Accounts}), served in the catalogue's own process, from its own
 * tables: who a token is for, by Better Auth's sessions; what their subscription entitles them to; and their use of
 * the API, kept as their last session and recorded while a payment of theirs is disputed.
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
  /** The session a bearer token is for, if any: Better Auth's, given the token as the only header. */
  readonly sessionOf: (token: string) => Promise<FoundSession | null>;
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
  return {
    async userOf(token) {
      const found = await sessionOf(token);
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
    },
    entitlement,
    async used(user, use) {
      // An admin viewing the site as a user is not the user using it.
      if (user.impersonated) return;
      if (user.sessionId !== undefined) await access.seen(user.id, user.sessionId, use);
      await access.record(user.id, use);
    },
  };
}
