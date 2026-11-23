/**
 * Access records, against fraud: while a payment of a user's is disputed with their bank, each request they make, on
 * the website or through the API (as the EMMA extension's lookups), is recorded, as evidence that they know of the
 * service and use it. Recording starts as a dispute opens, with their last session (`last_sessions`), and every record
 * of them is deleted once none of their disputes is open, whatever came of it.
 *
 * Whom to record is worked out from the disputes open, kept a minute, so that a request of anyone else costs nothing
 * but a look in a set; a dispute opened or closed here changes it at once.
 */
import { and, desc, eq, sql } from 'drizzle-orm';

import { subscriptionCredits } from '../subscriptions/schema.js';
import { accessRecords, lastSessions, sessions } from './schema.js';

import type { Database } from '../db/database.js';
import type { AccessKind } from './schema.js';

/** How long whom to record is kept before it is worked out again. */
const WATCHED_TTL_MS = 60_000;

/** How often a session in use, from the same address, updates the user's last session. */
const SEEN_EVERY_MS = 10 * 60_000;

/** How many sessions' last updates are remembered, the oldest forgotten first. */
const SEEN_KEPT = 10_000;

/** A request, as it is recorded. */
export interface Access {
  readonly kind: Exclude<AccessKind, 'session'>;
  readonly path: string;
  readonly client: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** A user's last session, as it is kept. */
export type LastSession = typeof lastSessions.$inferSelect;

/** An access record, as it is read back. */
export type AccessRecord = typeof accessRecords.$inferSelect;

/** Recording users' access while their payments are disputed. */
export interface AccessRecorder {
  /**
   * Notes that a session of a user's is in use, from where and with what, as the catalogue itself knows it: the user's
   * last session is kept from it, at most once every ten minutes for one session from the same address.
   */
  seen(userId: string, sessionId: string, access: Access, now?: Date): Promise<void>;
  /** Records a request of a user's, if a payment of theirs is disputed now; otherwise does nothing. */
  record(userId: string, access: Access, now?: Date): Promise<void>;
  /** Starts recording a user's access, as a dispute of theirs opens, with their last session. */
  startRecording(userId: string): Promise<void>;
  /** Stops recording a user's access, and deletes every record of it, once no dispute of theirs is open. */
  stopRecording(userId: string): Promise<void>;
  /** A user's last session, kept after it ends. */
  lastSession(userId: string): Promise<LastSession | undefined>;
  /** A user's access records, the newest first. */
  records(userId: string): Promise<AccessRecord[]>;
}

/**
 * The recorder, over the database.
 *
 * @param db - The database
 * @param clock - The time now, in milliseconds; `Date.now` by default
 * @param remember - How many sessions' last updates are remembered
 * @returns The recorder
 */
export function accessRecorder(db: Database, clock: () => number = Date.now, remember = SEEN_KEPT): AccessRecorder {
  let watched: Promise<Set<string>> | undefined;
  let watchedAt = 0;
  /** When each session last updated the user's last session, and from where. */
  const lastSeen = new Map<string, { readonly at: number; readonly ipAddress: string | null }>();

  /** The users with a dispute open, worked out again once it is a minute old. */
  function watching(): Promise<Set<string>> {
    if (watched === undefined || clock() - watchedAt > WATCHED_TTL_MS) {
      watchedAt = clock();
      watched = db
        .selectDistinct({ userId: subscriptionCredits.userId })
        .from(subscriptionCredits)
        .where(eq(subscriptionCredits.disputed, 'open'))
        .then(rows => new Set(rows.map(row => row.userId)));
    }
    return watched;
  }

  /** Whether a user has a dispute open now, asked of the database. */
  async function disputing(userId: string): Promise<boolean> {
    const [open] = await db
      .select({ id: subscriptionCredits.id })
      .from(subscriptionCredits)
      .where(and(eq(subscriptionCredits.userId, userId), eq(subscriptionCredits.disputed, 'open')))
      .limit(1);
    return open !== undefined;
  }

  return {
    async seen(userId, sessionId, { ipAddress, userAgent }, now = new Date()) {
      const before = lastSeen.get(sessionId);
      if (before?.ipAddress === ipAddress && now.getTime() - before.at < SEEN_EVERY_MS) return;
      lastSeen.delete(sessionId);
      lastSeen.set(sessionId, { at: now.getTime(), ipAddress });
      // The oldest forgotten first: a Map keeps the order its entries were set in.
      for (const oldest of lastSeen.keys()) {
        if (lastSeen.size <= remember) break;
        lastSeen.delete(oldest);
      }
      // When it began, and what it was signed in for, are the session's own.
      const startedAt = sql`coalesce((select ${sessions.createdAt} from ${sessions} where ${sessions.id} = ${sessionId}), ${now.toISOString()}::timestamptz)`;
      const clientId = sql`(select ${sessions.clientId} from ${sessions} where ${sessions.id} = ${sessionId})`;
      await db
        .insert(lastSessions)
        .values({ userId, sessionId, startedAt, lastActiveAt: now, ipAddress, userAgent, clientId })
        .onConflictDoUpdate({
          target: lastSessions.userId,
          set: { sessionId, startedAt, lastActiveAt: now, endedAt: null, ipAddress, userAgent, clientId },
        });
    },

    async record(userId, access, now = new Date()) {
      if (!(await watching()).has(userId)) return;
      await db.insert(accessRecords).values({ userId, at: now, ...access });
    },

    async startRecording(userId) {
      (await watching()).add(userId);
      // Their last session first, once: a dispute opened again, or another opened, records it no more.
      await db.execute(sql`
        insert into ${accessRecords} (user_id, at, kind, client, ip_address, user_agent)
        select user_id, last_active_at, 'session', coalesce(client_id, 'website'), ip_address, user_agent
        from ${lastSessions}
        where user_id = ${userId}
          and not exists (select 1 from ${accessRecords} where user_id = ${userId} and kind = 'session')`);
    },

    async stopRecording(userId) {
      if (await disputing(userId)) return;
      (await watching()).delete(userId);
      await db.delete(accessRecords).where(eq(accessRecords.userId, userId));
    },

    async lastSession(userId) {
      const [found] = await db.select().from(lastSessions).where(eq(lastSessions.userId, userId));
      return found;
    },

    records: userId =>
      db
        .select()
        .from(accessRecords)
        .where(eq(accessRecords.userId, userId))
        .orderBy(desc(accessRecords.at), desc(accessRecords.id)),
  };
}
