import { defineConfig } from 'drizzle-kit';

/** drizzle-kit's configuration: the schema it reads, and where it writes the accounts' migrations. */
export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
  strict: true,
});
