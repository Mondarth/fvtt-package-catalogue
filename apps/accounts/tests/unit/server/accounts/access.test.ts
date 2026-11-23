import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { accessRecorder } from '../../../../src/lib/server/accounts/access.js';
import { lastSessions, sessions, users } from '../../../../src/lib/server/accounts/schema.js';
import { subscriptionCredits } from '../../../../src/lib/server/subscriptions/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { Database } from '../../../../src/lib/server/db/database.js';

let db: Database;
let close: () => Promise<void>;

const at = (iso: string) => new Date(iso);
const later = new Date(Date.now() + 24 * 60 * 60 * 1000);

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  await db.insert(users).values([
    { id: 'u1', name: 'One', email: 'one@example.test', handle: 'amber-fox-oak-01' },
    { id: 'u2', name: 'Two', email: 'two@example.test', handle: 'bold-owl-elm-02' },
  ]);
});

afterEach(() => close());

/**
 * Signs a user in, as Better Auth does.
 * @param id - The session's id
 * @param more - Its other fields
 */
async function signIn(id: string, more: Partial<typeof sessions.$inferInsert> = {}) {
  await db.insert(sessions).values({ id, token: `t-${id}`, userId: 'u1', expiresAt: later, ...more });
}

const kept = async (userId = 'u1') => (await db.select().from(lastSessions).where(eq(lastSessions.userId, userId)))[0];

describe("a user's last session", () => {
  it('is kept as each session is made, refreshed, and ended, its ending marked', async () => {
    await signIn('s1', {
      createdAt: at('2026-11-20T09:00:00Z'),
      updatedAt: at('2026-11-20T09:00:00Z'),
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox/140.0',
      clientId: 'emma-extension',
    });
    expect(await kept()).toEqual({
      userId: 'u1',
      sessionId: 's1',
      startedAt: at('2026-11-20T09:00:00Z'),
      lastActiveAt: at('2026-11-20T09:00:00Z'),
      endedAt: null,
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox/140.0',
      clientId: 'emma-extension',
    });

    // Refreshed: last active then.
    await db
      .update(sessions)
      .set({ updatedAt: at('2026-11-21T09:00:00Z') })
      .where(eq(sessions.id, 's1'));
    expect(await kept()).toMatchObject({ sessionId: 's1', lastActiveAt: at('2026-11-21T09:00:00Z') });

    // A newer one replaces it; an older one refreshed before that does not.
    await signIn('s2', { createdAt: at('2026-11-22T09:00:00Z'), updatedAt: at('2026-11-22T09:00:00Z') });
    await db
      .update(sessions)
      .set({ updatedAt: at('2026-11-21T12:00:00Z') })
      .where(eq(sessions.id, 's1'));
    expect(await kept()).toMatchObject({ sessionId: 's2', clientId: null });

    // Ending another changes nothing; ending it marks when, and keeps it.
    await db.delete(sessions).where(eq(sessions.id, 's1'));
    expect((await kept())?.endedAt).toBeNull();
    await db.delete(sessions).where(eq(sessions.id, 's2'));
    expect(await kept()).toMatchObject({ sessionId: 's2', endedAt: expect.any(Date) as Date });
  });

  it("is never an admin's session viewing the site as the user", async () => {
    await signIn('admins', { impersonatedBy: 'admin' });
    expect(await kept()).toBeUndefined();
  });

  it('goes with the user', async () => {
    await signIn('s1');
    await db.delete(users).where(eq(users.id, 'u1'));
    expect(await kept()).toBeUndefined();
  });
});

describe("a disputing user's access", () => {
  /** A payment of the user's, with a dispute open or not. */
  async function paid(id: string, disputed: 'open' | 'won' | null, userId = 'u1') {
    await db.insert(subscriptionCredits).values({
      id,
      userId,
      source: 'payment',
      provider: 'stripe',
      externalRef: `pi_${id}`,
      startsAt: at('2026-11-01T00:00:00Z'),
      endsAt: at('2027-11-01T00:00:00Z'),
      disputed,
    });
  }
  const API = {
    kind: 'api',
    path: '/api/v2/lookup',
    client: 'EMMA-extension/0.13.1',
    ipAddress: '203.0.113.7',
    userAgent: 'Firefox/140.0',
  } as const;

  it('is recorded only while a dispute of theirs is open, from their last session, and cleared once none is', async () => {
    let now = 0;
    const access = accessRecorder(db, () => now);
    await signIn('s1', { updatedAt: at('2026-11-21T09:00:00Z'), ipAddress: '203.0.113.7' });

    // No dispute: nothing is recorded.
    await access.record('u1', API, at('2026-11-22T00:00:00Z'));
    expect(await access.records('u1')).toEqual([]);

    // A dispute opens: recording starts with their last session, once.
    await paid('c1', 'open');
    await access.startRecording('u1');
    await access.startRecording('u1');
    await access.record('u1', API, at('2026-11-22T09:00:00Z'));
    await access.record('u2', API, at('2026-11-22T09:00:00Z'));
    expect(await access.records('u1')).toMatchObject([
      { kind: 'api', path: '/api/v2/lookup', client: 'EMMA-extension/0.13.1', at: at('2026-11-22T09:00:00Z') },
      { kind: 'session', path: null, client: 'website', ipAddress: '203.0.113.7', at: at('2026-11-21T09:00:00Z') },
    ]);
    expect(await access.records('u2')).toEqual([]);
    expect(await access.lastSession('u1')).toMatchObject({ sessionId: 's1' });
    expect(await access.lastSession('u2')).toBeUndefined();

    // Another still open: kept.
    await paid('c2', 'open');
    await db.update(subscriptionCredits).set({ disputed: 'won' }).where(eq(subscriptionCredits.id, 'c1'));
    await access.stopRecording('u1');
    expect(await access.records('u1')).toHaveLength(2);

    // None open: stopped, and cleared.
    await db.update(subscriptionCredits).set({ disputed: 'lost' }).where(eq(subscriptionCredits.id, 'c2'));
    await access.stopRecording('u1');
    expect(await access.records('u1')).toEqual([]);
    await access.record('u1', API);
    expect(await access.records('u1')).toEqual([]);

    // Disputes opened elsewhere are seen once whom to record is worked out again, a minute on.
    await paid('c3', 'open', 'u2');
    await access.record('u2', API);
    expect(await access.records('u2')).toEqual([]);
    now += 61_000;
    await access.record('u2', API);
    expect(await access.records('u2')).toHaveLength(1);
  });

  it('starts with no session where none was ever kept, and records with the time now by default', async () => {
    const access = accessRecorder(db);
    await paid('c1', 'open');
    await access.startRecording('u1');
    await access.record('u1', API);
    expect(await access.records('u1')).toMatchObject([{ kind: 'api', at: expect.any(Date) as Date }]);
  });
});

describe('a session in use, as the catalogue sees it', () => {
  const SITE = {
    kind: 'site',
    path: '/',
    client: 'website',
    ipAddress: '203.0.113.7',
    userAgent: 'Firefox/140.0',
  } as const;

  it("keeps the user's last session from where the catalogue sees it, not Better Auth's address, at most every ten minutes", async () => {
    const access = accessRecorder(db);
    // Better Auth, with no X-Forwarded-For, says localhost.
    await signIn('s1', { createdAt: at('2026-11-20T09:00:00Z'), ipAddress: '127.0.0.1', clientId: 'emma-extension' });
    await access.seen('u1', 's1', SITE, at('2026-11-22T09:00:00Z'));
    expect(await kept()).toMatchObject({
      sessionId: 's1',
      startedAt: at('2026-11-20T09:00:00Z'),
      lastActiveAt: at('2026-11-22T09:00:00Z'),
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox/140.0',
      clientId: 'emma-extension',
    });

    // Again within ten minutes, from the same address: nothing is written.
    await access.seen('u1', 's1', SITE, at('2026-11-22T09:05:00Z'));
    expect((await kept())?.lastActiveAt).toEqual(at('2026-11-22T09:00:00Z'));
    // From another address: at once.
    await access.seen('u1', 's1', { ...SITE, ipAddress: '198.51.100.1' }, at('2026-11-22T09:06:00Z'));
    expect(await kept()).toMatchObject({ ipAddress: '198.51.100.1', lastActiveAt: at('2026-11-22T09:06:00Z') });
    // Ten minutes on: again.
    await access.seen('u1', 's1', { ...SITE, ipAddress: '198.51.100.1' }, at('2026-11-22T09:20:00Z'));
    expect((await kept())?.lastActiveAt).toEqual(at('2026-11-22T09:20:00Z'));

    // Better Auth refreshing the session keeps what the catalogue saw.
    await db
      .update(sessions)
      .set({ updatedAt: at('2026-11-23T09:00:00Z') })
      .where(eq(sessions.id, 's1'));
    expect(await kept()).toMatchObject({ ipAddress: '198.51.100.1', lastActiveAt: at('2026-11-23T09:00:00Z') });
  });

  it('takes a session the trigger has not kept, and one it knows nothing of, as begun when seen', async () => {
    const access = accessRecorder(db);
    await access.seen('u1', 'unknown', SITE, at('2026-11-22T09:00:00Z'));
    expect(await kept()).toMatchObject({ sessionId: 'unknown', startedAt: at('2026-11-22T09:00:00Z'), clientId: null });
    await access.seen('u1', 'other', SITE);
    expect((await kept())?.sessionId).toBe('other');
  });

  it('forgets the oldest sessions it saw, beyond those it remembers', async () => {
    const access = accessRecorder(db, Date.now, 1);
    await access.seen('u1', 'a', SITE, at('2026-11-22T09:00:00Z'));
    await access.seen('u1', 'b', SITE, at('2026-11-22T09:01:00Z'));
    // `a` forgotten: seen again within ten minutes, it is written all the same.
    await access.seen('u1', 'a', SITE, at('2026-11-22T09:02:00Z'));
    expect(await kept()).toMatchObject({ sessionId: 'a', lastActiveAt: at('2026-11-22T09:02:00Z') });
  });
});
