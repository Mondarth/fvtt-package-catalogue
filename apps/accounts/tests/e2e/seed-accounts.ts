/**
 * Seeds the accounts' database for the end-to-end tests: theirs, and the catalogue's, which run the accounts beside
 * the catalogue. The migrations are applied first (`node build/migrate.js`, from apps/accounts).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { eq, inArray } from 'drizzle-orm';

import { accounts, sessions, users } from '../../src/lib/server/accounts/schema.js';
import { connect } from '../../src/lib/server/db/connect.js';
import { MINIMUM_SETTING } from '../../src/lib/server/subscriptions/patreon.js';
import { catalogueSettings, subscriptionCredits } from '../../src/lib/server/subscriptions/schema.js';
import { E2E_ADMIN, E2E_PATREON_MINIMUM, E2E_TOKENS } from './environment.js';

/** The accounts' directory, which their migrations are applied from. */
const ACCOUNTS_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Applies the migrations to the accounts' database, and seeds it.
 *
 * @param env - The accounts' environment, its `DATABASE_URL` among it
 */
export async function seedAccounts(env: Readonly<Record<string, string>> & { readonly DATABASE_URL: string }) {
  execFileSync('node', ['build/migrate.js'], { cwd: ACCOUNTS_DIR, env: { ...process.env, ...env }, stdio: 'inherit' });
  const connection = connect(env.DATABASE_URL);
  try {
    const { db } = connection;
    // The admin: signing in as them through the stand-in provider finds this profile, by its account.
    await db
      .insert(users)
      .values({
        id: E2E_ADMIN,
        name: `Test ${E2E_ADMIN}`,
        email: `${E2E_ADMIN}@example.test`,
        handle: 'e2e-admin-handle',
      })
      .onConflictDoNothing();
    await db
      .insert(accounts)
      .values({ id: `${E2E_ADMIN}-test`, providerId: 'test', accountId: E2E_ADMIN, userId: E2E_ADMIN })
      .onConflictDoNothing();

    // The least Patreon pledge that subscribes, £3.00, which the Patreon tests count on and the admin's test sets again.
    await db
      .insert(catalogueSettings)
      .values({ key: MINIMUM_SETTING, value: E2E_PATREON_MINIMUM, updatedBy: E2E_ADMIN })
      .onConflictDoUpdate({ target: catalogueSettings.key, set: { value: E2E_PATREON_MINIMUM } });

    // For the API's bearer tests: a subscriber and a user whose subscription has ended, and a session of each, and
    // the admin's, by tokens known beforehand. Made afresh each run, as their subscriptions are relative to now.
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const holders = [
      { id: 'e2e-subscriber', token: E2E_TOKENS.subscriber, ends: now + 30 * day },
      { id: 'e2e-lapsed', token: E2E_TOKENS.lapsed, ends: now - day },
    ];
    await db.delete(users).where(
      inArray(
        users.id,
        holders.map(holder => holder.id),
      ),
    );
    await db.delete(sessions).where(eq(sessions.token, E2E_TOKENS.admin));
    await db
      .insert(users)
      .values(
        holders.map(({ id }) => ({ id, name: `Test ${id}`, email: `${id}@example.test`, handle: `${id}-handle` })),
      );
    await db.insert(subscriptionCredits).values(
      holders.map(({ id, ends }) => ({
        id: `${id}-credit`,
        userId: id,
        source: 'grant' as const,
        months: 1,
        startsAt: new Date(ends - 30 * day),
        endsAt: new Date(ends),
      })),
    );
    await db.insert(sessions).values(
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
