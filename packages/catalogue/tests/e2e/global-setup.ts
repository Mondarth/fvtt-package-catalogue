import { execFileSync } from 'node:child_process';

import { eq, inArray } from 'drizzle-orm';

import { accounts, sessions, users } from '../../src/lib/server/accounts/schema.js';
import { subscriptionCredits } from '../../src/lib/server/subscriptions/schema.js';
import { connect } from '../../src/lib/server/db/connect.js';
import { drizzleStore } from '../../src/lib/server/store/drizzle.js';
import { E2E_ADMIN, E2E_ENV, E2E_TOKENS } from './environment.js';
import { SEEDED, SEEDED_AT, SEEDED_CORE, SEEDED_GAPS, SEEDED_RELEASES } from './seed.js';

/**
 * Migrates the database with the built worker, as a deployment does, then seeds it, and the admin the tests sign in as.
 * The database is the throwaway one of compose.yaml, so it starts empty and is emptied of what an earlier run left.
 */
export default async function globalSetup(): Promise<void> {
  execFileSync('node', ['build/worker/main.js', 'migrate'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
  const connection = connect(E2E_ENV.DATABASE_URL);
  try {
    await connection.db.execute(
      'truncate packages, raw_manifests, core_releases, source_gaps, crawl_requests, sync_runs restart identity cascade',
    );
    const store = drizzleStore(connection.db);
    await store.saveReleases(SEEDED, SEEDED_RELEASES, { source: 'e2e', at: SEEDED_AT });
    await store.saveCoreReleases(SEEDED_CORE);
    await store.recordGaps(SEEDED_GAPS);
    // The admin: signing in as them through the stand-in provider finds this profile, by its account.
    await connection.db
      .insert(users)
      .values({
        id: E2E_ADMIN,
        name: `Test ${E2E_ADMIN}`,
        email: `${E2E_ADMIN}@example.test`,
        handle: 'e2e-admin-handle',
      })
      .onConflictDoNothing();
    await connection.db
      .insert(accounts)
      .values({ id: `${E2E_ADMIN}-test`, providerId: 'test', accountId: E2E_ADMIN, userId: E2E_ADMIN })
      .onConflictDoNothing();

    // For the API's bearer tests: a subscriber and a user whose subscription has ended, and a session of each, and
    // the admin's, by tokens known beforehand. Made afresh each run, as their subscriptions are relative to now.
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const holders = [
      { id: 'e2e-subscriber', token: E2E_TOKENS.subscriber, ends: now + 30 * day },
      { id: 'e2e-lapsed', token: E2E_TOKENS.lapsed, ends: now - day },
    ];
    await connection.db.delete(users).where(
      inArray(
        users.id,
        holders.map(holder => holder.id),
      ),
    );
    await connection.db.delete(sessions).where(eq(sessions.token, E2E_TOKENS.admin));
    await connection.db
      .insert(users)
      .values(
        holders.map(({ id }) => ({ id, name: `Test ${id}`, email: `${id}@example.test`, handle: `${id}-handle` })),
      );
    await connection.db.insert(subscriptionCredits).values(
      holders.map(({ id, ends }) => ({
        id: `${id}-credit`,
        userId: id,
        source: 'grant' as const,
        months: 1,
        startsAt: new Date(ends - 30 * day),
        endsAt: new Date(ends),
      })),
    );
    await connection.db.insert(sessions).values(
      [...holders, { id: E2E_ADMIN, token: E2E_TOKENS.admin }].map(({ id, token }) => ({
        id: `${id}-session`,
        token,
        userId: id,
        expiresAt: new Date(now + day),
      })),
    );
  } finally {
    await connection.close();
  }
}
