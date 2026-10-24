# Testing

## Unit tests

[Vitest](https://vitest.dev), in each package:

- The contract's tests check what its schemas accept and refuse. Its type tests (`*.test-d.ts`) check that its types
  are those `@mondarth/fvtt-resolver` reads.
- The messages test checks that every locale translates every English message, and nothing else.
- The catalogue's tests mirror `src/` under `tests/unit/`, in two projects: `server` (Node) and `ui` (happy-dom, with
  `@testing-library/svelte`, for `*.svelte.test.ts`).

The store's tests run against [PGlite](https://pglite.dev), PostgreSQL in-process, with the real migrations applied
(`tests/unit/support/pglite.ts`): no Docker is needed. Endpoints are tested by calling them with a fake event
(`invoke` in `tests/unit/support/event.ts`) and a mock store.

Coverage is measured with V8 and must stay at the thresholds in each package's Vitest configuration; ratchet them up,
never down. What only wires things together (the environment, the connection, the worker's process) is excluded and
covered by the end-to-end tests.

A bug fix starts with a test that fails because of the bug, marked as a regression.

## End-to-end tests

[Playwright](https://playwright.dev), in `packages/catalogue/tests/e2e/`, against the built server and worker and a
throwaway PostgreSQL:

```shell
pnpm build
pnpm --filter @mondarth/fvtt-package-catalogue e2e:db        # PostgreSQL 18 on localhost:55433, in memory
pnpm test:e2e
pnpm --filter @mondarth/fvtt-package-catalogue e2e:db:stop
```

The global setup migrates the database with the built worker, as a deployment does, and seeds it through the store.
The `api` project tests the API with Playwright's request fixture; the `chromium`, `firefox` and `webkit` projects test
the website. Every page fails its test on a console error or uncaught exception, except those a test expects
(`allowedConsoleErrors`). CI runs each project on a runner of its own, on every pull request and every push to `dev`.
