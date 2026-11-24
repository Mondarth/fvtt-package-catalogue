/**
 * The accounts' database: Better Auth's tables, with the accounts' own (`accounts/schema.ts`), and subscriptions'
 * (`subscriptions/schema.ts`), as drizzle-kit reads them to write the migrations.
 */
export * from '../accounts/schema.js';
export * from '../subscriptions/schema.js';
