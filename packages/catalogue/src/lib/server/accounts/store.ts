/**
 * What the website asks of the accounts' tables beyond what Better Auth does itself: a user's nickname, the providers
 * they sign in with, and, for the admin pages, finding users and what is held of one. What changes a user's role, ban
 * or sessions goes through Better Auth's admin endpoints, whose hooks record it (`admin-hooks.ts`).
 */
import { and, asc, count, desc, eq, gt, ilike, or } from 'drizzle-orm';

import { accounts, sessions, users } from './schema.js';

import type { Database } from '../db/database.js';

/** A provider a user signs in with. */
export interface LinkedProvider {
  readonly providerId: string;
  /** When it was first used. */
  readonly linkedAt: Date;
}

/** A user, as the admin pages list them. */
export interface UserSummary {
  readonly id: string;
  readonly handle: string;
  readonly nickname: string | null;
  readonly name: string;
  readonly email: string;
  readonly role: string | null;
  readonly banned: boolean;
  readonly createdAt: Date;
}

/** A user, as their admin page shows them. */
export interface UserDetail extends UserSummary {
  readonly image: string | null;
  readonly banReason: string | null;
  readonly banExpires: Date | null;
  readonly providers: readonly LinkedProvider[];
  /** How many sessions are signed in now. */
  readonly sessions: number;
}

/** Which users to list. */
export interface UserSearch {
  /** Found in their handle, nickname, name or email, whatever the case. */
  readonly search?: string | undefined;
  readonly limit: number;
  readonly offset: number;
}

/** What the website asks of the accounts' tables. */
export interface AccountsStore {
  /**
   * Sets a user's nickname, or clears it.
   *
   * @returns `taken` if someone else has it, whatever its case
   */
  setNickname(userId: string, nickname: string | null): Promise<'ok' | 'taken'>;
  /** The providers a user signs in with, the first linked first. */
  linkedProviders(userId: string): Promise<LinkedProvider[]>;
  /** Users, the newest first, and how many there are in all. */
  listUsers(query: UserSearch): Promise<{ users: UserSummary[]; total: number }>;
  /** A user, if there is one by the id. */
  userDetail(userId: string): Promise<UserDetail | undefined>;
}

const summary = {
  id: users.id,
  handle: users.handle,
  nickname: users.nickname,
  name: users.name,
  email: users.email,
  role: users.role,
  banned: users.banned,
  createdAt: users.createdAt,
};

/** A search's text as a LIKE pattern that matches it anywhere, its own wildcards matched as themselves. */
const anywhere = (text: string) => `%${text.replaceAll(/[\\%_]/g, character => `\\${character}`)}%`;

/** PostgreSQL's code for a unique constraint broken. */
const UNIQUE_VIOLATION = '23505';

/** The code of a database error, wherever the driver puts it: Drizzle wraps the driver's error as its cause. */
function codeOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && error.code !== undefined) return error.code;
  return 'cause' in error ? codeOf(error.cause) : undefined;
}

/**
 * The store, over the database.
 *
 * @param db - The database
 * @returns The store
 */
export function accountsStore(db: Database): AccountsStore {
  const linkedProviders = (userId: string) =>
    db
      .select({ providerId: accounts.providerId, linkedAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.createdAt));

  return {
    async setNickname(userId, nickname) {
      try {
        await db.update(users).set({ nickname, updatedAt: new Date() }).where(eq(users.id, userId));
        return 'ok';
      } catch (error) {
        if (codeOf(error) === UNIQUE_VIOLATION) return 'taken';
        throw error;
      }
    },

    linkedProviders,

    async listUsers({ search, limit, offset }) {
      const text = search?.trim() ?? '';
      const where =
        text === ''
          ? undefined
          : or(
              ilike(users.handle, anywhere(text)),
              ilike(users.nickname, anywhere(text)),
              ilike(users.name, anywhere(text)),
              ilike(users.email, anywhere(text)),
            );
      const [found, [total]] = await Promise.all([
        db
          .select(summary)
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt), asc(users.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(users).where(where),
      ]);
      // A count always answers with a row.
      /* v8 ignore next */
      const all = total?.total ?? 0;
      return { users: found.map(user => ({ ...user, banned: user.banned === true })), total: all };
    },

    async userDetail(userId) {
      const [user] = await db
        .select({ ...summary, image: users.image, banReason: users.banReason, banExpires: users.banExpires })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user === undefined) return undefined;
      const [providers, [signedIn]] = await Promise.all([
        linkedProviders(userId),
        db
          .select({ sessions: count() })
          .from(sessions)
          .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()))),
      ]);
      // A count always answers with a row.
      /* v8 ignore next */
      const signedInNow = signedIn?.sessions ?? 0;
      return { ...user, banned: user.banned === true, providers, sessions: signedInNow };
    },
  };
}
