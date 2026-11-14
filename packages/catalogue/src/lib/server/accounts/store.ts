/**
 * What the website asks of the accounts' tables beyond what Better Auth does itself: a user's nickname, and the
 * providers they sign in with.
 */
import { asc, eq } from 'drizzle-orm';

import { accounts, users } from './schema.js';

import type { Database } from '../db/database.js';

/** A provider a user signs in with. */
export interface LinkedProvider {
  readonly providerId: string;
  /** When it was first used. */
  readonly linkedAt: Date;
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
}

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

    linkedProviders: userId =>
      db
        .select({ providerId: accounts.providerId, linkedAt: accounts.createdAt })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .orderBy(asc(accounts.createdAt)),
  };
}
