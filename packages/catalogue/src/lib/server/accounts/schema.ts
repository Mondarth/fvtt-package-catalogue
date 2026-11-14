/**
 * The accounts' tables: Better Auth's own, through its Drizzle adapter (see `auth.ts`), with the catalogue's handle and
 * nickname on each user. Kept apart from the catalogue's tables, so that accounts can move to a service of their own,
 * shared by every Mondarth site, without them. Columns are snake_case in PostgreSQL, as the catalogue's are; the keys
 * here are the field names Better Auth gives them.
 *
 * What these tables hold is what the website's "What we store" page (`/privacy`) lays out: change one, change both.
 */
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp({ withTimezone: true }).notNull().defaultNow();

/** A person who signed in, with what their sign-in provider gave of them. */
export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    /** The name the provider gave. */
    name: text().notNull(),
    /** The email address the provider gave. */
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    /** The address of the picture the provider gave. */
    image: text(),
    /** A random name, made of words, given when the profile is made: shown where no nickname is set. */
    handle: text().notNull().unique(),
    /** The name the user chose to be shown by, if any. */
    nickname: text(),
    createdAt,
    updatedAt,
  },
  table => [
    // Unique whatever the case, so that no one can pass for someone else by capitals alone.
    uniqueIndex('users_nickname_key').on(sql`lower(${table.nickname})`),
  ],
);

/** A browser signed in: its cookie holds the token. */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** The address the browser signed in from. */
    ipAddress: text(),
    /** What the browser said it was. */
    userAgent: text(),
    createdAt,
    updatedAt,
  },
  table => [index('sessions_user_id').on(table.userId)],
);

/** A sign-in provider's account, linked to a user. */
export const accounts = pgTable(
  'accounts',
  {
    id: text().primaryKey(),
    /** The provider's own id for the account. */
    accountId: text().notNull(),
    /** Which provider: `github`, and so on. */
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The provider's tokens, encrypted (`encryptOAuthTokens`).
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    // Unused: there is no signing in with a password.
    password: text(),
    createdAt,
    updatedAt,
  },
  table => [
    index('accounts_user_id').on(table.userId),
    uniqueIndex('accounts_provider_account').on(table.providerId, table.accountId),
  ],
);

/** What a sign-in in progress keeps until its provider answers, such as its state. */
export const verifications = pgTable(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  table => [index('verifications_identifier').on(table.identifier)],
);
