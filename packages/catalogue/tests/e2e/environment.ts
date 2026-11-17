/** The environment the end-to-end tests run the built server and worker in. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_API_KEY = 'e2e-key';
/** A module's key, which reaches only what the EMMA module needs. */
export const E2E_MODULE_KEY = 'e2e-module-key';

/**
 * Users seeded (global-setup.ts) with sessions of these tokens, for the API's bearer tests: one subscribed, one whose
 * subscription has ended, and the admin.
 */
export const E2E_TOKENS = {
  subscriber: 'e2esubscribertoken0000000000000000',
  lapsed: 'e2elapsedtoken000000000000000000000',
  admin: 'e2eadmintoken0000000000000000000000',
} as const;
/** What the browsers send, as SWAG does, so that the server knows they came by plain HTTP. */
export const FORWARDED_PROTO = { 'X-Forwarded-Proto': 'http' } as const;

/** The stand-in sign-in provider's port (fake-provider.ts). */
export const FAKE_PROVIDER_PORT = Number(process.env.FAKE_PROVIDER_PORT ?? 4174);
export const FAKE_PROVIDER_URL = `http://127.0.0.1:${String(FAKE_PROVIDER_PORT)}`;

/**
 * The admin the tests sign in as: seeded (global-setup.ts) with a profile and a stand-in provider's account of this
 * name, and an admin as ADMIN_USER_IDS names them.
 */
export const E2E_ADMIN = 'e2e-admin';
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://catalogue:catalogue@127.0.0.1:55433/catalogue_e2e',
  API_KEYS: `${E2E_API_KEY},e2e-previous-key,module:${E2E_MODULE_KEY}`,
  LOG_LEVEL: 'warn',
  PORT: String(E2E_PORT),
  MIGRATIONS_DIR: 'drizzle',
  AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  SITE_URL: `http://127.0.0.1:${String(E2E_PORT)}`,
  // As the deployment has it behind SWAG: the browsers say, as SWAG would, that they came by plain HTTP
  // (FORWARDED_PROTO). Without it adapter-node takes a request to be HTTPS, and refuses the forms as cross-site.
  PROTOCOL_HEADER: 'x-forwarded-proto',
  AUTH_TEST_PROVIDER_URL: FAKE_PROVIDER_URL,
  ADMIN_USER_IDS: E2E_ADMIN,
} as const;
