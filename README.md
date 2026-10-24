# Foundry VTT Package Catalogue

[![Dev CI](https://github.com/Mondarth/fvtt-package-catalogue/actions/workflows/dev.yml/badge.svg?branch=dev)](https://github.com/Mondarth/fvtt-package-catalogue/actions/workflows/dev.yml)
[![E2E](https://github.com/Mondarth/fvtt-package-catalogue/actions/workflows/e2e.yml/badge.svg?branch=dev)](https://github.com/Mondarth/fvtt-package-catalogue/actions/workflows/e2e.yml)
[![Docs](https://img.shields.io/badge/docs-mondarth.github.io-blue)](https://mondarth.github.io/fvtt-package-catalogue/)
[![codecov](https://codecov.io/gh/Mondarth/fvtt-package-catalogue/branch/dev/graph/badge.svg)](https://codecov.io/gh/Mondarth/fvtt-package-catalogue)
[![License: MIT](https://img.shields.io/github/license/Mondarth/fvtt-package-catalogue)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

What [Foundry VTT](https://foundryvtt.com), its game systems and its modules declare in their manifests, gathered from
Foundry VTT's package listing, GitHub and GitLab, and served through an API shaped for
[`@mondarth/fvtt-resolver`](https://github.com/ulenarofmondarth/pdt/tree/main/packages/fvtt-resolver) and
[EMMA](https://github.com/Mondarth/EMMA).

> **Status: early development.** The API serves what is in its database, and the deployment runs; the worker that fills
> the database is being built. Before 1.0.0, anything may change.

## Why it exists

EMMA and pdt work out which versions of a world's packages can be installed together. To do that in the browser, EMMA
reads Foundry VTT's listing, each package's releases on GitHub or GitLab, and each manifest, through a CORS proxy, within
a request budget. The catalogue does that work ahead of time, on the server, and answers in one request. It sits beside
the proxy as the faster source; where it has no answer, the clients fall back to the proxy.

## What is here

| Path                 | What                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/contract`  | [`@mondarth/fvtt-package-catalogue-contract`](packages/contract): the API's zod schemas, on npm     |
| `packages/catalogue` | The SvelteKit application: the API, the website, and the worker that keeps the database up to date  |
| `deploy/`            | Docker Compose for production, beside a [SWAG](https://docs.linuxserver.io/general/swag/) container |
| `docs/`              | The [documentation](https://mondarth.github.io/fvtt-package-catalogue/) (Sphinx, built in Docker)   |

## Using the API

```shell
curl -H "X-API-Key: $KEY" https://catalogue.example.com/api/v1/packages/module/midi-qol/releases
```

See [the API](https://mondarth.github.io/fvtt-package-catalogue/user/api.html) for the endpoints, keys and errors, and [deploying it](https://mondarth.github.io/fvtt-package-catalogue/user/deployment.html) to run
your own.

## Languages

The website is in English and Spanish. **The Spanish translation is a machine translation, made with AI for testing,
and has not been reviewed by a Spanish speaker**; every page in Spanish says so. Reviews by Spanish speakers are welcome
(see [Languages](https://mondarth.github.io/fvtt-package-catalogue/developer/i18n.html)). The API's messages are in English only.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT. See [LICENSE](LICENSE).

## AI Disclosure

This project is developed with AI assistance (Claude Code): code, tests, configuration and documentation. All changes
are human-reviewed before they are merged. The website's Spanish translation was machine-translated by AI and has not
yet been reviewed by a Spanish speaker; the site marks it as such.
