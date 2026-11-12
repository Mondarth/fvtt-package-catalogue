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

## Signing in while developing

The development server signs in without any real provider. `pnpm dev` serves a stand-in one at `/__dev/provider`, and
the sign-in page offers it as **Sign in with Test provider**. It asks who to sign in as, from a few made-up users
(Ada Lovelace, Grace Hopper, Alan Turing, Katherine Johnson and Linus Torvalds, who has a picture), or someone new each
time. Each user is a profile of its own in the development database, so signing out and in as another tries the site
as several people: nicknames one of them has taken, for one.

It exists on the development server alone: a Vite plugin in `vite.config.ts` serves it (`apply: 'serve'`), before
SvelteKit, and the server offers it only when `import.meta.env.DEV` is set (`accounts/dev-provider.ts`). A build has
neither. Setting `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` in `.env` offers GitHub beside it, through an OAuth app whose
callback is `http://localhost:5173/auth/callback/github`.

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

`pnpm build` needs `DATABASE_URL`, `API_KEYS`, `AUTH_SECRET` and `SITE_URL` set, as SvelteKit validates the environment
while it builds (see
{ref}`environment`). The `.env` from `.env.example` does.
