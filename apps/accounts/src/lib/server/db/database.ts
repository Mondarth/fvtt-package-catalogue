/**
 * The database as the store sees it: Drizzle over PostgreSQL, whichever driver connects to it. The server and the
 * migrations use postgres.js; the tests use PGlite, PostgreSQL in-process.
 */
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type * as schema from './schema.js';

export type Schema = typeof schema;

/** Drizzle over PostgreSQL, with the accounts' schema. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
