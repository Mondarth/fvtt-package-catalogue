import { E2E_INTERNAL_KEY, accountsEnv } from '../../../accounts/tests/e2e/environment.js';

/** The environment the end-to-end tests run the built server and worker in. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_API_KEY = 'e2e-key';
/** A module's key, which reaches only what the EMMA module needs. */
export const E2E_MODULE_KEY = 'e2e-module-key';

/**
 * Users seeded (global-setup.ts) with sessions of these tokens, for the API's bearer tests: one subscribed, one whose
 * subscription has ended, and the admin.
 */
/** What the browsers send, as SWAG does, so that the server knows they came by plain HTTP. */
export const FORWARDED_PROTO = { 'X-Forwarded-Proto': 'http' } as const;

/** The stand-in sign-in provider's port (fake-provider.ts). */
/** The accounts, served beside the catalogue for its tests, from apps/accounts, with a database of their own. */
export const ACCOUNTS_PORT = Number(process.env.E2E_ACCOUNTS_PORT ?? 4176);
export const ACCOUNTS_URL = `http://127.0.0.1:${String(ACCOUNTS_PORT)}`;
export const ACCOUNTS_DATABASE_URL =
  process.env.E2E_ACCOUNTS_DATABASE_URL ?? 'postgres://accounts:accounts@127.0.0.1:55436/accounts_e2e';

/** The catalogue's address in its tests. */
export const E2E_URL = `http://127.0.0.1:${String(E2E_PORT)}`;

/** The accounts' environment, as the catalogue's tests serve them: sending visitors back to the catalogue. */
export const ACCOUNTS_ENV = accountsEnv(ACCOUNTS_PORT, ACCOUNTS_DATABASE_URL, { APP_ORIGINS: E2E_URL });

export {
  E2E_INTERNAL_KEY,
  E2E_TOKENS,
  FAKE_PROVIDER_PORT,
  FAKE_PROVIDER_URL,
} from '../../../accounts/tests/e2e/environment.js';

export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://catalogue:catalogue@127.0.0.1:55433/catalogue_e2e',
  API_KEYS: `${E2E_API_KEY},e2e-previous-key,module:${E2E_MODULE_KEY}`,
  LOG_LEVEL: 'warn',
  PORT: String(E2E_PORT),
  MIGRATIONS_DIR: 'drizzle',
  ACCOUNTS_URL,
  ACCOUNTS_SITE_URL: ACCOUNTS_URL,
  ACCOUNTS_KEY: E2E_INTERNAL_KEY,
  // As the deployment has it behind SWAG: the browsers say, as SWAG would, that they came by plain HTTP.
  PROTOCOL_HEADER: 'x-forwarded-proto',
} as const;
