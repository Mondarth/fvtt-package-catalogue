/** The environment the end-to-end tests run the built server and worker in. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_API_KEY = 'e2e-key';
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://catalogue:catalogue@127.0.0.1:55433/catalogue_e2e',
  API_KEYS: `${E2E_API_KEY},e2e-previous-key`,
  LOG_LEVEL: 'warn',
  PORT: String(E2E_PORT),
  MIGRATIONS_DIR: 'drizzle',
} as const;
