# Setting up

You need Node.js 24 or later, [pnpm](https://pnpm.io) 12 and Docker. Python is never installed on the host: the
documentation builds in a container.

```shell
pnpm install                                # also installs the git hooks
cp packages/catalogue/.env.example packages/catalogue/.env
pnpm --filter @mondarth/fvtt-package-catalogue db:start     # PostgreSQL on localhost:55432
pnpm --filter @mondarth/fvtt-package-catalogue db:migrate
pnpm dev                                    # http://localhost:5173
```

`db:stop` stops the database; its data is kept in a volume until `docker compose -f compose.dev.yaml down -v`.

## Commands

From the repository root:

| Command                   | What it does                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| `pnpm typecheck`          | Types, with TypeScript 7 (`typecheck:fallback` uses TypeScript 6)      |
| `pnpm check`              | `svelte-check`; warnings fail                                         |
| `pnpm lint`               | ESLint; warnings fail                                                 |
| `pnpm format:check`       | Formatting (`pnpm format` fixes it)                                   |
| `pnpm test`               | The repository's tooling tests, then each package's unit tests        |
| `pnpm test:coverage`      | Unit tests with coverage; fails below the thresholds                  |
| `pnpm build`              | The contract, then the server and the worker                          |
| `pnpm test:e2e`           | Playwright against the build (see {doc}`testing`)                     |
| `pnpm build:docs`         | This documentation, in Docker; warnings fail                          |
| `pnpm devserve:docs`      | This documentation with live reload, on <http://localhost:8089>       |

`pnpm build` needs `DATABASE_URL` and `API_KEYS` set, as SvelteKit validates the environment while it builds (see
{ref}`environment`). The `.env` from `.env.example` does.
