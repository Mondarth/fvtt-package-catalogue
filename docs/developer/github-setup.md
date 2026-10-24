# Setting up the repository on GitHub

What the workflows need of `Mondarth/fvtt-package-catalogue`.

## Branches and rulesets

- The default branch is `dev` (the first push left it at `main`: change it under Settings → General).
- Rulesets on `dev` and `main`: changes only through pull requests, merge commits only, and the **CI passed** and
  **E2E passed** checks required. The release App is on both rulesets' bypass lists.

## The release App

A GitHub App, installed on the repository with **Contents: read and write**, **Issues: read and write** and **Pull
requests: read and write**. Its token lets semantic-release push the release commits to `main` and the workflow bring
`dev` up to date.

| Name                      | Kind     | Value                         |
| ------------------------- | -------- | ----------------------------- |
| `RELEASE_APP_CLIENT_ID`   | Variable | The App's client ID           |
| `RELEASE_APP_PRIVATE_KEY` | Secret   | A private key of the App      |
| `CODECOV_TOKEN`           | Secret   | The repository's Codecov token (optional) |

## npm

On npmjs.com, give `@mondarth/fvtt-package-catalogue-contract` a trusted publisher: GitHub Actions, repository
`Mondarth/fvtt-package-catalogue`, workflow `release.yml`. The first version must be published by hand before a
trusted publisher can be set.

## The container image

The release workflow pushes to the GitHub Container Registry with its own `GITHUB_TOKEN`. After the first release, set
the package `fvtt-package-catalogue` to public (or give the deployment host a token that can read it), and link it to
the repository.

## Pages

Settings → Pages → Source: **GitHub Actions**.
