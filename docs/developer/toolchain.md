# The toolchain

| Tool              | Version | Notes                                                                           |
| ----------------- | ------- | ------------------------------------------------------------------------------- |
| Node.js           | 24      | `.nvmrc`, `engines`                                                             |
| pnpm              | 12      | `packageManager`; other package managers are refused (`devEngines`)            |
| TypeScript        | 7 and 6 | See below                                                                      |
| SvelteKit         | 3.1     | With `@sveltejs/adapter-node` 6, Svelte 5.57, Vite 8                            |
| Drizzle ORM       | 0.45    | drizzle-kit 0.31; postgres.js 3.4; PGlite 0.5 in tests                          |
| zod               | 4.6     | The contract; the environment                                                   |
| Paraglide JS      | 2.29    | The website's messages                                                          |
| Vitest            | 5.0     | With `@vitest/coverage-v8`, happy-dom, `@testing-library/svelte`                |
| Playwright        | 1.64    |                                                                                 |
| ESLint            | 10      | typescript-eslint's strict type-checked rules, eslint-plugin-svelte             |
| semantic-release  | 25      | With semantic-release-monorepo                                                  |
| PostgreSQL        | 18      | `postgres:18-alpine`                                                           |

## TypeScript 7 and 6

TypeScript 7, the native compiler, is installed as `typescript7` and gives the `tsc` command. `typescript` is an alias
of TypeScript 6 (`npm:@typescript/typescript6`), whose command is `tsc6`, for the tools that load TypeScript as a
library. As of this writing:

| Stage                                   | Runs on                                      |
| --------------------------------------- | -------------------------------------------- |
| `pnpm typecheck` (`tsc --noEmit`)       | TypeScript 7                                 |
| `pnpm typecheck:fallback`               | TypeScript 6, to catch where the two differ  |
| The contract's build (`tsc -p …`)       | TypeScript 7                                 |
| `svelte-check`, typescript-eslint       | TypeScript 6: they use its language service  |
| Vitest's type tests                     | TypeScript 7 (Vitest runs `tsc`)             |
| Vite, Vitest, Playwright                | Neither: they strip types with their own tools |
| `@sveltejs/kit`                         | Requires `typescript` ^6 as a peer           |

Reassess the fallback when these tools move to TypeScript 7, and remove it once none needs it.
