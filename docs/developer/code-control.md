# Branches and commits

## Branches

`dev`
: Where work is integrated. It changes only through pull requests: branch from it (`feat/…`, `fix/…`, `docs/…`) and
  open a pull request back into it.

`main`
: What has been released. It changes only through a pull request from `dev`, and every merge into it runs the release
  workflow.

```{mermaid}
flowchart LR
    feature["feat/… or fix/…"] -- pull request --> dev
    dev -- pull request --> main
    main -- release commits merged back --> dev
```

Merge pull requests into both with **Create a merge commit**. semantic-release reads each commit to choose the
versions and write the release notes; a squash would replace them with one, and squashes and rebases would leave `dev`
and `main` with histories that conflict at the next release.

## Commits

Commitizen prompts for a [Conventional Commits](https://www.conventionalcommits.org) message when you commit from a
terminal (or `pnpm commit`), and commitlint refuses any message that does not conform. On top of Conventional Commits:

- a scope is required, in kebab-case: `fix(api): …`;
- the header is at most 72 characters;
- the subject is in the imperative mood: "add", not "added" or "adds".

The rules are in `commitlint.config.ts`; CI checks every commit of a pull request too. The pre-commit hook runs
ESLint, Prettier, the type checks and the tests related to the staged files.

## Versions

Each package is released on its own, from the commits that change its files, and tagged `<package name>-v<version>`.
Versions follow SemVer from the commits: `fix` is a patch, `feat` a minor version, and `!` after the scope or a
`BREAKING CHANGE:` footer a major one. A change to the contract that breaks its clients is a major version of the
contract.
