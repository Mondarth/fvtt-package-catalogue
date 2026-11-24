/**
 * The accounts' end-to-end environment: the built server, on its own port, against a throwaway PostgreSQL
 * (`pnpm e2e:db`), with the stand-ins for the sign-in providers, Patreon and Stripe beside it.
 */

/** The port the built server is served on, apart from the catalogue's E2E server. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4274);

/** The server's address. */
export const E2E_URL = `http://127.0.0.1:${String(E2E_PORT)}`;

/** The key the internal API is called with in the tests, as an application would. */
export const E2E_INTERNAL_KEY = 'e2e-internal-key-e2e-internal-key-00';

/** The API's bearer tokens of the seeded users' sessions (see `seed-accounts.ts`). */
export const E2E_TOKENS = {
  subscriber: 'e2esubscribertoken0000000000000000',
  lapsed: 'e2elapsedtoken000000000000000000000',
  admin: 'e2eadmintoken0000000000000000000000',
} as const;

/**
 * What the browsers send, as SWAG would: that they came by plain HTTP. Without it adapter-node takes a request to be
 * HTTPS, and refuses the forms as cross-site.
 */
export const FORWARDED_PROTO = { 'X-Forwarded-Proto': 'http' } as const;

/** The stand-in sign-in provider, and Patreon (fake-provider.ts). */
export const FAKE_PROVIDER_PORT = Number(process.env.FAKE_PROVIDER_PORT ?? 4276);
export const FAKE_PROVIDER_URL = `http://127.0.0.1:${String(FAKE_PROVIDER_PORT)}`;

/** The stand-in Stripe (fake-stripe.ts). */
export const FAKE_STRIPE_PORT = Number(process.env.FAKE_STRIPE_PORT ?? 4277);
export const FAKE_STRIPE_URL = `http://127.0.0.1:${String(FAKE_STRIPE_PORT)}`;
export const E2E_STRIPE_WEBHOOK_SECRET = 'whsec_e2e_secret';

/** The admin, made so by `ADMIN_USER_IDS`, whom signing in as `e2e-admin` through the stand-in finds. */
export const E2E_ADMIN = 'e2e-admin';

/** The least Patreon pledge that subscribes, as seeded. */
export const E2E_PATREON_MINIMUM = { currency: 'GBP', amount: 300 } as const;

/** The accounts' database in the tests. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://accounts:accounts@127.0.0.1:55435/accounts_e2e';

/**
 * The accounts' environment, for the server and its migrations, at a port and address given: their own tests', or the
 * catalogue's, which run them beside the catalogue.
 *
 * @param port - The port they are served on
 * @param databaseUrl - Their database
 * @param more - Anything else, such as the applications they send visitors back to
 * @returns The environment
 */
export function accountsEnv(port: number, databaseUrl: string, more: Record<string, string> = {}) {
  return {
    DATABASE_URL: databaseUrl,
    LOG_LEVEL: 'warn',
    PORT: String(port),
    HOST: '127.0.0.1',
    MIGRATIONS_DIR: 'drizzle',
    AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
    SITE_URL: `http://127.0.0.1:${String(port)}`,
    PROTOCOL_HEADER: 'x-forwarded-proto',
    AUTH_TEST_PROVIDER_URL: FAKE_PROVIDER_URL,
    // Patreon, stood in for by the same stand-in (fake-provider.ts), its campaign the stand-in's.
    AUTH_PATREON_ID: 'e2e-patreon',
    AUTH_PATREON_SECRET: 'e2e-patreon-secret',
    PATREON_CAMPAIGN_ID: 'e2e-campaign',
    PATREON_URL: FAKE_PROVIDER_URL,
    ADMIN_USER_IDS: E2E_ADMIN,
    // Stripe, stood in for by fake-stripe.ts, as a sandbox: its key a test one.
    STRIPE_SECRET_KEY: 'sk_test_e2e',
    STRIPE_WEBHOOK_SECRET: E2E_STRIPE_WEBHOOK_SECRET,
    STRIPE_API_URL: FAKE_STRIPE_URL,
    INTERNAL_API_KEYS: E2E_INTERNAL_KEY,
    ...more,
  };
}

/** The accounts' own tests' environment. */
export const E2E_ENV = accountsEnv(E2E_PORT, E2E_DATABASE_URL);
