import { defineEnvVars } from '@sveltejs/kit/env';

import { ApiKeys, DatabaseUrl, LogLevel } from '#lib/server/config.js';

/** The server's environment, validated when it starts. The worker reads the same through `readConfig`. */
export const variables = defineEnvVars({
  DATABASE_URL: { description: 'The PostgreSQL connection string.', schema: DatabaseUrl },
  API_KEYS: {
    description: 'The API keys accepted, separated by commas. Several, so that a key can be rotated.',
    schema: ApiKeys,
  },
  LOG_LEVEL: { description: 'debug, info, warn or error; info by default.', schema: LogLevel },
});
