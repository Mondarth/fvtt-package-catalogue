# Contributing to the Foundry VTT Package Catalogue

Thank you for your interest. This project is at an early stage, so expect things to move around.

The developer documentation (sources in [`docs/developer/`](docs/developer/)) covers the design and tooling in more
depth. This file is the short version.

## Getting set up

You need Node.js 24 or later, [pnpm](https://pnpm.io) 12 and Docker.

```shell
git clone <URL of your fork>
cd fvtt-package-catalogue
pnpm install
cp packages/catalogue/.env.example packages/catalogue/.env
pnpm --filter @mondarth/fvtt-package-catalogue db:start
pnpm --filter @mondarth/fvtt-package-catalogue db:migrate
pnpm dev
```

`pnpm install` also installs the git hooks described below. The project only accepts pnpm.

## Workflow

1. Fork the repository and create a short-lived branch from `dev`, named for the change: `feat/...`, `fix/...`,
   `docs/...`.
2. Write a failing test first, then the change. A bug fix starts with a test that reproduces the bug.
3. Run the checks (below).
4. Commit using Conventional Commits (see below).
5. Open a pull request against `dev`. The **CI passed** and **E2E passed** checks must be green before it is merged.

Keep pull requests small and focused, and update the documentation alongside the code.

`dev` is where work is integrated; `main` holds what has been released. Releases are made by the maintainer through a
pull request from `dev` into `main`, merged with a merge commit (never squashed or rebased, since the individual commit
messages decide the versions).

## Checks

| Command              | What it checks                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`     | Types, with TypeScript 7 (`pnpm typecheck:fallback` uses TypeScript 6) |
| `pnpm check`         | `svelte-check`; warnings fail                                          |
| `pnpm lint`          | ESLint; warnings fail                                                  |
| `pnpm format:check`  | Formatting (`pnpm format` fixes it)                                    |
| `pnpm test`          | The repository's tooling, then each package's unit tests               |
| `pnpm test:coverage` | Unit tests with coverage; fails below the configured thresholds        |
| `pnpm build`         | The contract, the server and the worker build                          |
| `pnpm test:e2e`      | Playwright against the build (see the testing guide for the database)  |
| `pnpm build:docs`    | The documentation builds with no warnings                              |

CI runs all of these on every pull request, and also checks the commit messages.

## Code standards

- All source is TypeScript in strict mode. Do not add JavaScript source files (configuration a tool requires in
  JavaScript excepted) or use `any`.
- The API's shape is the contract's (`packages/contract`). Change the contract first; every response is validated
  against it before it is sent.
- Routes read and write through the store (`CatalogueStore`), never Drizzle directly. A schema change comes with its
  migration (`db:generate`).
- Text the website shows goes in `packages/catalogue/messages/en.json`, and in every other locale's file in the same
  change, never into a component (see [Languages](docs/developer/i18n.md)).
- A translation made by machine is listed in `MACHINE_TRANSLATED` (`src/lib/i18n.ts`), so that its pages say so, until
  a speaker of the language has reviewed it. Spanish is machine translated: corrections from Spanish speakers are
  welcome.
- Log through `#lib/server/log.js`, not `console`.
- The catalogue's libraries go in `devDependencies`, so that they are bundled into the build (see the architecture
  guide).
- Unit tests live in `packages/*/tests/`, mirroring `src/`. Tests of the repository's tooling are in `tests/` at the
  root.

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org), with these extra rules:

- a scope is required, in kebab-case: `fix(api): …`;
- the header is at most 72 characters;
- the subject is in the imperative mood: "add", not "added" or "adds".

The type decides the next version number, so choose it with care:

| Type                                                                | Release |
| ------------------------------------------------------------------- | ------- |
| `fix`                                                               | patch   |
| `feat`                                                              | minor   |
| `!` after the scope, or a `BREAKING CHANGE:` footer                 | major   |
| `docs`, `test`, `refactor`, `style`, `perf`, `build`, `ci`, `chore` | none    |

When you commit from a terminal, Commitizen prompts you for the parts of the message (or run `pnpm commit`). commitlint
then rejects any message that does not conform. Reference issues with `Closes #N` in the body so that the release notes
link to them.

Releases are fully automated. Never edit a version number or a `CHANGELOG.md` by hand.

## Git hooks

The pre-commit hook runs ESLint, Prettier, the type checks and the tests related to your staged files. The commit-msg
hook runs `commitlint`.

### Emergency bypass

Do not bypass the hooks as a matter of routine. If you genuinely must, for example to save work when a hook itself is
broken:

```shell
git commit --no-verify -m "fix(scope): describe the change"
```

Before you push, fix whatever blocked the hooks, then revalidate:

```shell
pnpm format:check && pnpm lint && pnpm typecheck && pnpm check && pnpm test
git commit --amend --no-edit
```

The first line repeats the pre-commit checks by hand; the amend alone would not, because the hook only looks at staged
files. The amend re-runs `commitlint` on the message. If either fails, fix the problem and repeat until both pass. Say
in the pull request that the hooks were bypassed and why. CI runs the same checks regardless, so a bypassed commit that
does not pass will not be merged.

## AI Disclosure

Parts of this project, including code, tests, configuration and documentation, were produced with AI assistance. All
changes are human-reviewed before they are merged. The website's Spanish translation was produced by machine (AI) and
has not been reviewed by a Spanish speaker; pages in Spanish say so. If you use AI tools for a contribution, review the output yourself
before submitting it; you are responsible for what you submit.
