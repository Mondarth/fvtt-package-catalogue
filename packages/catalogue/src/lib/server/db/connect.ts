/**
 * Connecting to PostgreSQL, for the server and the worker.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema.js';

import type { Database } from './database.js';

/** An open connection pool. */
export interface Connection {
  readonly db: Database;
  /** Applies the migrations in a directory that are not yet applied. */
  migrate(migrationsFolder: string): Promise<void>;
  /** Closes the pool, waiting up to a few seconds for queries to finish. */
  close(): Promise<void>;
}

/**
 * Connects to PostgreSQL.
 *
 * @param url - The connection string
 * @returns The connection
 */
export function connect(url: string): Connection {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  const db = drizzle({ client, schema, casing: 'snake_case' });
  return {
    db,
    migrate: migrationsFolder => migrate(db, { migrationsFolder }),
    close: () => client.end({ timeout: 5 }),
  };
}
