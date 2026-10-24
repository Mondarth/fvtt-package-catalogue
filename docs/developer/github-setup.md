# Setting up the repository on GitHub

What the workflows need of `Mondarth/fvtt-package-catalogue`, in the order it was set up.

## Branches and rulesets

- Push `main` and `dev` first, so that there are branches for the rulesets: one empty commit on both is enough. The
  project then arrives through a pull request into `dev`.
- The default branch is `dev`. The first push makes it `main`: change it under Settings → General.
- Leave **Automatically delete head branches** off. The release workflow merges `main` back into `dev` through a pull
  request when it cannot fast-forward, and deleting that pull request's head would delete `main`.
- A ruleset for each of `dev` and `main`:
  - changes only through pull requests, merged with **merge commits only** (semantic-release reads every commit);
  - no deletion, no force pushes;
  - the **CI passed** and **E2E passed** checks required;
  - the release App on the bypass list.
- Once the checks have run once (on the first pull request), set each check's source to **GitHub Actions** in both
  rulesets. GitHub cannot offer the source before the check exists. Without it, any app or status of the same name
  would satisfy the ruleset.

## The release App

A GitHub App, installed on the repository with **Contents: read and write**, **Issues: read and write** and **Pull
requests: read and write**. Its token lets semantic-release push the release commits to `main` and the workflow bring
`dev` up to date. The catalogue uses `mondarth-emma-release`, as EMMA does. It is installed on selected repositories,
so add this one under the App's **Repository access**.

| Name                      | Kind     | Value                                     |
| ------------------------- | -------- | ----------------------------------------- |
| `RELEASE_APP_CLIENT_ID`   | Variable | The App's client ID                       |
| `RELEASE_APP_PRIVATE_KEY` | Secret   | A private key of the App                  |
| `CODECOV_TOKEN`           | Secret   | The repository's Codecov token (optional) |

## Security and Actions

- Settings → Code security: Dependabot alerts and security updates, secret scanning with push protection, and
  **private vulnerability reporting**, which `SECURITY.md` and the issue templates send reporters to. Code scanning
  stays on the CodeQL workflow (not the default setup).
- Settings → Actions → General → Workflow permissions: **Read repository contents and packages permissions**. Every
  workflow asks for what it writes.

(release-tags)=

## Release tags

semantic-release finds each package's last version from its tags, `<package name>-v<version>`, and releases a
package with no tag as `1.0.0`. So each package starts from a `v0.0.0` tag on `main`, made by hand:

```shell
git tag -a @mondarth/fvtt-package-catalogue-contract-v0.0.0 -m "…" <commit on main>
git tag -a @mondarth/fvtt-package-catalogue-v0.0.0 -m "…" <commit on main>
git push origin refs/tags/@mondarth/fvtt-package-catalogue-contract-v0.0.0 refs/tags/@mondarth/fvtt-package-catalogue-v0.0.0
```

Their first releases are then `0.1.0` (or `0.0.1`). A package added later starts from a tag of its own in the same
way.

(npm-trusted-publisher)=

## npm trusted publishing

The release workflow publishes `@mondarth/fvtt-package-catalogue-contract` without a token: npm trusts the
repository's release workflow instead, through OIDC, and attaches provenance. That trust is set per package, and only
for a package that already exists, so the package is created by hand first.

1. **Have the scope.** `@mondarth` belongs to the npm organisation `mondarth`; publish as one of its owners, with
   two-factor authentication on.
2. **Log in with pnpm.** pnpm 12 keeps its own credentials, in `~/.config/pnpm/auth.ini`, and does not read
   `~/.npmrc`'s: `npm login` alone leaves pnpm with whatever token it had, and a stale one fails the publish with
   `404 Not Found`. So log in through pnpm, and check:

   ```shell
   pnpm login
   pnpm whoami
   ```

   npm itself refuses to run inside the repository (the workspace's `devEngines` asks for pnpm), so run any `npm`
   command from another directory, such as `cd ~ && npm …`.
3. **Publish a placeholder,** with the package at version `0.0.0`. `--no-git-checks` lets it go from a branch other
   than `main`:

   ```shell
   pnpm --filter @mondarth/fvtt-package-catalogue-contract build
   cd packages/contract
   pnpm publish --access public --no-git-checks
   ```

   The registry asks for your second factor. From a shell that is not interactive, such as Claude Code's `!` prompt,
   pnpm cannot ask: give your authenticator's current code with `--otp <code>`, or run the command in a terminal of
   your own.

   npm stages publishes for approval, but a brand-new package cannot be staged, so creating the package publishes a
   stub, `0.0.0-stage` (a `package.json` and the README), as well as `0.0.0`. Neither is staged: `npm stage list`
   shows nothing to approve.
4. **Add the trusted publisher.** On npmjs.com, the package's **Settings** → **Trusted publishing** → **GitHub
   Actions**, with permission to publish (not only to stage):

   | Field                | Value                    |
   | -------------------- | ------------------------ |
   | Organization or user | `Mondarth`               |
   | Repository           | `fvtt-package-catalogue` |
   | Workflow filename    | `release.yml`            |
   | Environment name     | leave empty              |

   npm does not check these when you save them. A mistake only shows when the release fails to publish; reading them
   back (`npm trust list <package>`) needs your second factor.
5. **Release** (see {doc}`ci-cd`), and check the version on npm: published by GitHub Actions, with an attestation.
6. **Stop token publishing.** Set the package's **Publishing access** to **Require two-factor authentication and
   disallow tokens**. Trusted publishing keeps working, and nothing else can publish without your second factor.
7. **Deprecate the placeholders**, which the release left beside it:

   ```shell
   cd ~ && npm deprecate "@mondarth/fvtt-package-catalogue-contract@0.0.0-stage" "Placeholder stub, with no code: use 0.1.0 or later" --otp <code>
   cd ~ && npm deprecate "@mondarth/fvtt-package-catalogue-contract@0.0.0" "Placeholder published to set up trusted publishing: use 0.1.0 or later" --otp <code>
   ```

Provenance needs the repository and the package to be public.

## The container image

The release workflow pushes `ghcr.io/mondarth/fvtt-package-catalogue` with its own `GITHUB_TOKEN`. The first release
(0.1.0) created the package public and linked to the repository, from the image's
`org.opencontainers.image.source` label. Check it with a pull that has no credentials at all:

```shell
mkdir -p /tmp/anon && echo '{}' > /tmp/anon/config.json
DOCKER_CONFIG=/tmp/anon docker pull ghcr.io/mondarth/fvtt-package-catalogue:latest
```

If that is refused, set the package public under the organisation's **Packages** → `fvtt-package-catalogue` →
**Package settings** → **Change visibility**. There is no API for it.

## Pages

Settings → Pages → Source: **GitHub Actions**. The `github-pages` environment deploys from `main` only.
