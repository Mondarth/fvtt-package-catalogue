import { defineEnvVars } from '@sveltejs/kit/env';

import {
  AccountsKey,
  AccountsSiteUrl,
  AccountsUrl,
  ApiKeys,
  ApiRatePerMinute,
  DatabaseUrl,
  LogLevel,
} from '#lib/server/config.js';

/** The server's environment, validated when it starts. The worker reads the same through `readConfig`. */
export const variables = defineEnvVars({
  DATABASE_URL: { description: 'The PostgreSQL connection string.', schema: DatabaseUrl },
  API_KEYS: {
    description:
      "The API keys accepted, separated by commas, each module:<key> for the EMMA module's, or the key alone for one that reaches every endpoint. Several, so that a key can be rotated.",
    schema: ApiKeys,
  },
  LOG_LEVEL: { description: 'debug, info, warn or error; info by default.', schema: LogLevel },
  API_RATE_PER_MINUTE: {
    description: 'The most API requests one key or user may make in a minute; 300 by default.',
    schema: ApiRatePerMinute,
  },
  ACCOUNTS_URL: {
    description:
      "The accounts' address on the deployment's own network, such as http://accounts:3000, for their internal API.",
    schema: AccountsUrl,
  },
  ACCOUNTS_KEY: {
    description: "The catalogue's key to the accounts' internal API: one of their INTERNAL_API_KEYS.",
    schema: AccountsKey,
  },
  ACCOUNTS_SITE_URL: {
    description:
      "The accounts' address as visitors reach it, such as https://accounts.example.org: where they sign in, and where the pages that moved there are sent.",
    schema: AccountsSiteUrl,
  },
});
