/**
 * The server's long-lived parts, made once when it starts: the connection pool, the store and the logger.
 */
import { API_KEYS, DATABASE_URL, LOG_LEVEL } from '$app/env/private';

import { connect } from './db/connect.js';
import { createLogger } from './log.js';
import { drizzleStore } from './store/drizzle.js';

export const log = createLogger({ level: LOG_LEVEL });
export const connection = connect(DATABASE_URL);
export const store = drizzleStore(connection.db);
export const apiKeys = API_KEYS;
