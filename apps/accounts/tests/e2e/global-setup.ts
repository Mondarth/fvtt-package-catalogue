import { E2E_ENV } from './environment.js';
import { seedAccounts } from './seed-accounts.js';

/** Before the tests: the accounts' database migrated and seeded. */
export default async function globalSetup(): Promise<void> {
  await seedAccounts(E2E_ENV);
}
