/**
 * The accounts' tables: Better Auth's own, through its Drizzle adapter (see `auth.ts`), with the catalogue's handle and
 * nickname on each user. Kept apart from the catalogue's tables, so that accounts can move to a service of their own,
 * shared by every Mondarth site, without them. Columns are snake_case in PostgreSQL, as the catalogue's are; the keys
 * here are the field names Better Auth gives them.
 *
 * What these tables hold is what the website's "What we store" page (`/privacy`) lays out: change one, change both.
 */
import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
    /** Their role: `user`, or `admin` (see `permissions.ts`); none is a user's. Set by an admin. */
    role: text(),
    /** Whether an admin has stopped them signing in, why, and until when; for good when no end is set. */
    banned: boolean().default(false),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true }),
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
    /** The admin viewing the site as this session's user, for an impersonation's session: it lasts an hour. */
    impersonatedBy: text(),
    /** The client a device signed in for, such as `emma-extension`; none for the website's own. */
    clientId: text(),
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

/**
 * What admins have done, and what anyone did while an admin viewed the site as them: who, as whom, what, to whom, and
 * how it was before and after. Users are named by their ids alone, and no foreign key holds them, so that the record
 * outlasts a profile deleted.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** The admin who did it: the one viewing the site as someone, while impersonating. */
    actorId: text().notNull(),
    /** The user it was done as, while an admin viewed the site as them. */
    asUserId: text(),
    /** What was done, such as `user.set-role`: see `audit.ts`. */
    action: text().notNull(),
    /** The user it was done to, if anyone. */
    subjectId: text(),
    /** What it changed, from and to, such as a role. */
    before: jsonb(),
    after: jsonb(),
    /** The request's id, as the logs give it. */
    requestId: text(),
  },
  table => [
    index('audit_log_at').on(table.at),
    index('audit_log_actor_id').on(table.actorId),
    index('audit_log_subject_id').on(table.subjectId),
  ],
);

/**
 * A device signing in, such as EMMA's browser extension (`device.ts`): the code it polls with, the code its user enters
 * or confirms, whose it is once they have looked, and whether they approved it. Kept until its codes expire, ten
 * minutes on, or the device has its token.
 */
export const deviceCodes = pgTable(
  'device_codes',
  {
    id: text().primaryKey(),
    /** The code the device polls with, which it keeps to itself. */
    deviceCode: text().notNull().unique(),
    /** The code its user enters or confirms, such as `WDJBMJHT`. */
    userCode: text().notNull().unique(),
    /** The user who looked at it, signed in, and so may approve it. */
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** `pending`, `approved` or `denied`. */
    status: text().notNull(),
    lastPolledAt: timestamp({ withTimezone: true }),
    pollingInterval: integer(),
    /** The client signing in, such as `emma-extension`. */
    clientId: text(),
    scope: text(),
  },
  table => [index('device_codes_user_id').on(table.userId)],
);

/**
 * Each user's latest session, kept after it ends, against fraud: if a payment of theirs is disputed with their bank, it
 * shows that they knew of the service and used it. A database trigger on `sessions` keeps it (migration 0023): a new
 * or refreshed session replaces it, and one ending marks when it ended. An admin's session viewing the site as the user
 * is not theirs, and not kept.
 */
export const lastSessions = pgTable('last_sessions', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  /** When it was last refreshed: Better Auth refreshes a session in use about once a day. */
  lastActiveAt: timestamp({ withTimezone: true }).notNull(),
  /** When it ended: signed out, or expired; none while it runs. */
  endedAt: timestamp({ withTimezone: true }),
  ipAddress: text(),
  userAgent: text(),
  /** The client it was signed in for, such as `emma-extension`; none for the website. */
  clientId: text(),
});

/** What an access record is of: the user's last session, seeded as recording starts, or a request they made. */
export const ACCESS_KINDS = ['session', 'site', 'api'] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

/**
 * A user's use of the service, recorded against fraud only while a payment of theirs is disputed: when, what they asked
 * for, through which client, from where and with what. Recording starts with their last session as a dispute opens, and
 * every record of them is deleted once none is open, whatever its outcome (see `access.ts`).
 */
export const accessRecords = pgTable(
  'access_records',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    kind: text({ enum: ACCESS_KINDS }).notNull(),
    /** The path asked for; for a session, none. */
    path: text(),
    /** The client: `website`, `emma-extension`, or the API client named by its header. */
    client: text(),
    ipAddress: text(),
    userAgent: text(),
  },
  table => [index('access_records_user_id').on(table.userId)],
);

/** What a known identity is of: an email address, or a sign-in account (its provider and its id there). */
export const IDENTITY_KINDS = ['email', 'account'] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/**
 * Every identity an account was ever known by, against abuse: an email address, or a sign-in account, each kept as a
 * keyed hash (HMAC-SHA256), never as itself (see `identities.ts`). It is tied to no user, so that it outlives deleting
 * the account: an introductory offer is claimed once a person, whatever accounts they make, and purchases refused
 * after a dispute lost stay refused, as the Terms and Conditions say (Sec. B.V.3, B.IV.5).
 */
export const knownIdentities = pgTable('known_identities', {
  /** The identity's keyed hash, hex. */
  hash: text().primaryKey(),
  kind: text({ enum: IDENTITY_KINDS }).notNull(),
  firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** When an account known by it claimed an introductory offer. */
  introductoryClaimedAt: timestamp({ withTimezone: true }),
  /** When purchases by it were refused, after a dispute was lost; none while it may buy. */
  purchasesRefusedAt: timestamp({ withTimezone: true }),
});
