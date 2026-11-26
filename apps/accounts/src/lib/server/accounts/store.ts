/**
 * What the website asks of the accounts' tables beyond what Better Auth does itself: a user's nickname, the providers
 * they sign in with, and, for the admin pages, finding users and what is held of one. What changes a user's role, ban
 * or sessions goes through Better Auth's admin endpoints, whose hooks record it (`admin-hooks.ts`).
 */
import { and, asc, count, desc, eq, gt, ilike, ne, or } from 'drizzle-orm';

import { isUniqueViolation } from '../db/errors.js';
import { RETURN_KEPT_MS, isReturnSite } from './return-to.js';
import { accounts, sessions, users } from './schema.js';

import type { Database } from '../db/database.js';
import type { ReturnTo } from './return-to.js';

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

/** A session, as the profile's list of signed-in devices reads it: never its token. */
export interface SessionSummary {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly userAgent: string | null;
  /** Where it was signed in from. */
  readonly ipAddress: string | null;
  /** The client a device signed in for, if it was one. */
  readonly clientId: string | null;
  /** The admin viewing the site as the user, for such a session. */
  readonly impersonatedBy: string | null;
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
  /** A user's sessions that have not ended, the newest first. */
  sessionsOf(userId: string, now?: Date): Promise<SessionSummary[]>;
  /**
   * Ends a user's sessions: the one by its id, or every one but the id given; never another user's.
   *
   * @returns How many were ended
   */
  endSessions(userId: string, which: { readonly only: string } | { readonly except: string }): Promise<number>;
  /** Keeps the way back to another application with a session, in place of any it had. */
  setReturn(sessionId: string, to: ReturnTo, now?: Date): Promise<void>;
  /** The way back kept with a session: none if none was, or it is older than {@link RETURN_KEPT_MS}. */
  returnOf(sessionId: string, now?: Date): Promise<ReturnTo | undefined>;
  /** Forgets a session's way back, once taken. */
  clearReturn(sessionId: string): Promise<void>;
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
        if (isUniqueViolation(error)) return 'taken';
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

    sessionsOf: (userId, now = new Date()) =>
      db
        .select({
          id: sessions.id,
          createdAt: sessions.createdAt,
          updatedAt: sessions.updatedAt,
          userAgent: sessions.userAgent,
          ipAddress: sessions.ipAddress,
          clientId: sessions.clientId,
          impersonatedBy: sessions.impersonatedBy,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
        .orderBy(desc(sessions.createdAt)),

    async endSessions(userId, which) {
      const ended = await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            'only' in which ? eq(sessions.id, which.only) : ne(sessions.id, which.except),
          ),
        )
        .returning({ id: sessions.id });
      return ended.length;
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
    async setReturn(sessionId, to, now = new Date()) {
      await db
        .update(sessions)
        .set({ returnTo: to.url, returnSite: to.site, returnAt: now })
        .where(eq(sessions.id, sessionId));
    },
    async returnOf(sessionId, now = new Date()) {
      const [kept] = await db
        .select({ url: sessions.returnTo, site: sessions.returnSite, at: sessions.returnAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (kept?.url == null || kept.at === null || !isReturnSite(kept.site)) return undefined;
      return now.getTime() - kept.at.getTime() > RETURN_KEPT_MS ? undefined : { url: kept.url, site: kept.site };
    },
    async clearReturn(sessionId) {
      await db
        .update(sessions)
        .set({ returnTo: null, returnSite: null, returnAt: null })
        .where(eq(sessions.id, sessionId));
    },
  };
}
