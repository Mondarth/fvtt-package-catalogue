# The database

PostgreSQL 18, through [Drizzle ORM](https://orm.drizzle.team). The schema is in
`packages/catalogue/src/lib/server/db/schema.ts`; tables and columns are snake_case in the database.

| Table            | Holds                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| `packages`       | Each package known, with its listing details and when its releases were last updated     |
| `releases`       | Each version of a package, as the API gives it                                           |
| `relationships`  | What each release requires, runs in, conflicts with or recommends, in manifest order     |
| `raw_manifests`  | Manifests as fetched, by hash, so releases can be normalised again without fetching      |
| `core_releases`  | Foundry VTT's builds                                                                     |
| `source_gaps`    | What a source could not fetch or read                                                    |
| `crawl_requests` | Packages waiting for the worker, asked for or needed by a closure, and their retries     |
| `sync_runs`      | Each run of a worker job                                                                 |

## Changing the schema

1. Change `schema.ts`.
2. Generate the migration: `pnpm --filter @mondarth/fvtt-package-catalogue db:generate --name <what-changed>`.
3. Read the SQL it wrote in `drizzle/`, and commit it with the change. Never edit a migration that has been released.

Deployments apply migrations with the worker (`node build/worker/main.js migrate`), before the server starts. The unit
tests apply them to PGlite, so a migration that does not apply, or that does not match what the store expects, fails
them.

## Drizzle and the store

Drizzle stays behind the store (`CatalogueStore`). The store takes `Database`, any Drizzle PostgreSQL database with the
schema, so one implementation serves postgres.js in production and PGlite in tests.

Two things about Drizzle to know:

- `$onUpdate` runs only for `update()`, not for an upsert's `onConflictDoUpdate`, so the store sets `updated_at`
  itself.
- An aggregate without `GROUP BY` always gives one row, but its type allows none.
