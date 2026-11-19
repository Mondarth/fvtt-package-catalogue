/**
 * The audit log: what admins have done, and what anyone did while an admin viewed the site as them (see `auditLog` in
 * `schema.ts`). Better Auth's admin endpoints are recorded by its hooks, whoever calls them (see `admin-hooks.ts`);
 * the website's own changes made while impersonating are recorded by the routes that make them.
 */
import { and, desc, eq, lt, or } from 'drizzle-orm';

import { auditLog } from './schema.js';

import type { Database } from '../db/database.js';

/** What an entry records. */
export const AUDIT_ACTIONS = [
  'user.set-role',
  'user.ban',
  'user.unban',
  'user.impersonate',
  'user.stop-impersonating',
  'user.revoke-sessions',
  'profile.nickname',
  'subscription.grant',
  'subscription.set-end',
  'subscription.revoke',
  'offer.create',
  'offer.retire',
  'patreon.minimum',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** An entry, as it is recorded. */
export interface AuditEntry {
  /** The admin who did it. */
  readonly actorId: string;
  /** The user it was done as, while the admin viewed the site as them. */
  readonly asUserId?: string | null | undefined;
  readonly action: AuditAction;
  /** The user it was done to. */
  readonly subjectId?: string | null | undefined;
  readonly before?: Readonly<Record<string, unknown>> | null | undefined;
  readonly after?: Readonly<Record<string, unknown>> | null | undefined;
  readonly requestId?: string | null | undefined;
}

/** An entry, as it is read back. */
export interface AuditRow {
  readonly id: number;
  readonly at: Date;
  readonly actorId: string;
  readonly asUserId: string | null;
  readonly action: string;
  readonly subjectId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly requestId: string | null;
}

/** Which entries to read. */
export interface AuditQuery {
  /** At most this many, newest first. */
  readonly limit: number;
  /** Only those older than this entry, for the next page. */
  readonly beforeId?: number | undefined;
  /** Only those about this user: done to them, by them, or as them. */
  readonly userId?: string | undefined;
}

/** The audit log's table. */
export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  recent(query: AuditQuery): Promise<AuditRow[]>;
  /**
   * Forgets what the entries about a user held of them, when their profile is deleted: what was changed, such as
   * their nickname or a ban's reason. Who did what to which user id, and when, is kept.
   */
  forget(userId: string): Promise<void>;
}

/**
 * The store, over the database.
 *
 * @param db - The database
 * @returns The store
 */
export function auditStore(db: Database): AuditStore {
  return {
    async record(entry) {
      await db.insert(auditLog).values({
        actorId: entry.actorId,
        asUserId: entry.asUserId ?? null,
        action: entry.action,
        subjectId: entry.subjectId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        requestId: entry.requestId ?? null,
      });
    },

    recent: ({ limit, beforeId, userId }) =>
      db
        .select()
        .from(auditLog)
        .where(
          and(
            beforeId === undefined ? undefined : lt(auditLog.id, beforeId),
            userId === undefined
              ? undefined
              : or(eq(auditLog.subjectId, userId), eq(auditLog.actorId, userId), eq(auditLog.asUserId, userId)),
          ),
        )
        .orderBy(desc(auditLog.id))
        .limit(limit),

    async forget(userId) {
      await db
        .update(auditLog)
        .set({ before: null, after: null })
        .where(or(eq(auditLog.subjectId, userId), eq(auditLog.asUserId, userId)));
    },
  };
}
