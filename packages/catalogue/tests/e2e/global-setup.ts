import { execFileSync } from 'node:child_process';

import { connect } from '../../src/lib/server/db/connect.js';
import { drizzleStore } from '../../src/lib/server/store/drizzle.js';
import { E2E_ENV } from './environment.js';
import { SEEDED, SEEDED_AT, SEEDED_RELEASES } from './seed.js';

/**
 * Migrates the database with the built worker, as a deployment does, then seeds it. The database is the throwaway one
 * of compose.yaml, so it starts empty and is emptied of what an earlier run left.
 */
export default async function globalSetup(): Promise<void> {
  execFileSync('node', ['build/worker/main.js', 'migrate'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
  const connection = connect(E2E_ENV.DATABASE_URL);
  try {
    await connection.db.execute('truncate packages, raw_manifests restart identity cascade');
    await drizzleStore(connection.db).saveReleases(SEEDED, SEEDED_RELEASES, { source: 'e2e', at: SEEDED_AT });
  } finally {
    await connection.close();
  }
}
