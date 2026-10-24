# CI and releases

| Workflow                | When                                         | What                                                                 |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `dev.yml` (Dev CI)      | Pull requests; pushes to `dev`; from release | Commit messages, type checks, svelte-check, lint, unit tests with coverage, build, image build, docs; **CI passed** |
| `e2e.yml` (E2E)         | Pull requests; pushes to `dev`; from release | Playwright: `api`, `chromium`, `firefox`, `webkit`, one runner each; **E2E passed** |
| `release.yml` (Release) | Pushes to `main`; by hand                    | Dev CI and E2E, then semantic-release, the image, `dev` brought up to date, Pages |
| `docs.yml`              | From Dev CI                                  | Builds this documentation in Docker                                  |
| `codeql.yml`            | Pushes, pull requests, weekly                | CodeQL                                                               |
| `dependency-review.yml` | Pull requests                                | Refuses dependencies with known vulnerabilities                      |

Superseded runs of a pull request are cancelled.

E2E installs each browser's system libraries with apt, from the runner's Ubuntu mirror, which now and then stalls. An
install that takes over five minutes is stopped and tried once more, with a warning in the run's summary; if the second
try fails too, re-run the failed job.

## Releasing

Merge the pull request from `dev` into `main`. The release workflow then:

1. runs Dev CI and E2E in full; nothing is released unless both pass;
2. runs semantic-release in each package (`pnpm release`). Each package with commits that call for one gets a version,
   a changelog entry, a tag and a GitHub release. The contract is published to npm through trusted publishing;
3. if the catalogue was released, builds its image from the release's tag for `linux/amd64` and `linux/arm64`, and
   pushes it to `ghcr.io/mondarth/fvtt-package-catalogue` as `<version>`, `<major>.<minor>`, `<major>` and `latest`;
4. merges `main` back into `dev`, or opens a pull request to;
5. publishes the documentation to GitHub Pages.

`pnpm release:dry-run` shows what would be released, without releasing it.

The tests in `tests/config/` check that this wiring holds together: each package's release configuration, the
workflows' jobs and outputs, the deployment's networks, the compose projects' names, and that every third-party action
is pinned to a commit.
