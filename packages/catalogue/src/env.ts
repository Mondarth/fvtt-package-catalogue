import { defineEnvVars } from '@sveltejs/kit/env';

import {
  ApiKeys,
  AuthSecret,
  DatabaseUrl,
  LogLevel,
  ProviderCredential,
  SiteUrl,
  TestProviderUrl,
} from '#lib/server/config.js';

/** The server's environment, validated when it starts. The worker reads the same through `readConfig`. */
export const variables = defineEnvVars({
  DATABASE_URL: { description: 'The PostgreSQL connection string.', schema: DatabaseUrl },
  API_KEYS: {
    description: 'The API keys accepted, separated by commas. Several, so that a key can be rotated.',
    schema: ApiKeys,
  },
  LOG_LEVEL: { description: 'debug, info, warn or error; info by default.', schema: LogLevel },
  AUTH_SECRET: {
    description: "Signs the website's cookies and encrypts sign-in providers' tokens: at least 32 random characters.",
    schema: AuthSecret,
  },
  SITE_URL: {
    description: "The website's address as visitors reach it, such as https://catalogue.example.org.",
    schema: SiteUrl,
  },
  AUTH_GITHUB_ID: {
    description: "The GitHub OAuth app's client id; GitHub is offered only with it.",
    schema: ProviderCredential,
  },
  AUTH_GITHUB_SECRET: { description: "The GitHub OAuth app's client secret.", schema: ProviderCredential },
  AUTH_TEST_PROVIDER_URL: {
    description: 'A stand-in sign-in provider, for the end-to-end tests alone. Never set in a deployment.',
    schema: TestProviderUrl,
  },
});
