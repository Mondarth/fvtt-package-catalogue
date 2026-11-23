import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../../../src/lib/server/db/schema.js';

import type { Database } from '../../../src/lib/server/db/database.js';

const MIGRATIONS = new URL('../../../drizzle', import.meta.url).pathname;

/**
 * A fresh database, PostgreSQL in-process, with the migrations drizzle-kit generated applied: the tests check the
 * migrations as well as the queries.
 */
export async function testDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}
