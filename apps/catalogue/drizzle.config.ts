import { defineConfig } from 'drizzle-kit';

/** Generates migrations into drizzle/ from the schema. `db:migrate` and Studio need DATABASE_URL. */
export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
  strict: true,
});
