# Deploying it

The catalogue runs as containers: its server, the worker that fills its database, a PostgreSQL database, and a one-shot
migration that brings the database's schema up to date before the server and the worker start. `deploy/compose.yaml`
runs all four beside an existing
[SWAG](https://docs.linuxserver.io/general/swag/) container, which serves the catalogue over HTTPS.

```{mermaid}
flowchart LR
    client["EMMA, pdt"] -- HTTPS --> swag["SWAG"]
    subgraph swagnet ["SWAG's network"]
      swag
      app
    end
    swag -- "http://fvtt-package-catalogue:3000" --> app["app (server)"]
    subgraph database ["database network (internal)"]
      app
      migrate["migrate (one-shot)"]
      worker
      db[(PostgreSQL)]
    end
    app --> db
    migrate --> db
    worker --> db
    subgraph egress ["egress network"]
      worker
    end
    worker -- HTTPS --> web["Foundry VTT, GitHub, GitLab"]
```

Only the server joins SWAG's network, and only the worker joins `egress`, the network with a way out, to fetch
packages. The database is on a network of its own, marked `internal`, so it cannot be reached from SWAG's network and
has no way out. Nothing is published on the host.

## Setting up

1. Copy `deploy/compose.yaml` and `deploy/.env.example` (at the release's tag) to the host, and the latter to `.env`.
2. In `.env`, set:

   `SWAG_NETWORK`
   : The Docker network SWAG is on: see `docker network ls`. With SWAG in its own compose project, it is usually
     `swag_default`.

   `POSTGRES_PASSWORD`
   : The database's password. It goes into a connection URL, so keep to URL-safe characters: `openssl rand -hex 32`.

   `API_KEYS`
   : The keys clients present, separated by commas (`openssl rand -hex 32`).

   `CATALOGUE_TAG`
   : The release to run: a version (`0.1.0`), its line (`0.1`, `0`) or `latest`.

   `AUTH_SECRET`
   : Signs the website's cookies and encrypts what sign-in providers give (`openssl rand -hex 32`). Keep it secret,
     and keep it the same: changing it signs everyone out, and the providers' tokens already stored can no longer be
     read.

   `SITE_URL`
   : The website's address as visitors reach it through SWAG, such as `https://catalogue.example.org`. Sign-in
     providers send visitors back to it.

   `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (optional)
   : Signing in with GitHub (see [Signing in](#signing-in)). Without both, the sign-in page does not offer it.

   `GITHUB_TOKEN`, `GITLAB_TOKEN` (optional)
   : Raise the worker's limit on GitHub's API from 60 requests an hour to 5000; a token needs no scopes. Without one,
     packages listed by Foundry VTT still crawl in full, as their manifests are not fetched through the API.

3. Copy `deploy/swag/fvtt-package-catalogue.subdomain.conf.sample` to SWAG's
   `/config/nginx/proxy-confs/fvtt-package-catalogue.subdomain.conf`, set its `server_name`, and restart SWAG.
4. Start it: `docker compose up -d`. The server starts once `migrate` has exited successfully:

   ```shell
   docker compose ps -a                # migrate: exited (0); app, db: running (healthy); worker: running
   docker compose logs migrate         # "The database is up to date"
   docker compose logs worker          # "The worker started", then each job
   ```

## Signing in

The website asks visitors to sign in with an account they already have: GitHub, for now. Each provider is offered only
once its app is set up:

GitHub
: Create an OAuth app (GitHub: Settings, Developer settings, OAuth Apps). Its homepage URL is `SITE_URL`, and its
  authorization callback URL is `SITE_URL` followed by `/auth/callback/github`. Put its client id and a client secret in
  `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`, then `docker compose up -d app`.

Signing in keeps what the provider gives of the visitor (their name, email address and picture), their sessions, and
where each session signed in from. The website's "What we store" page (`/privacy`) lays it all out, row by row, and a
visitor can delete their profile, and all of it with it, from their profile page. The sign-in page says what is stored,
and links to that page, before any provider is chosen.

The API is not signed in to: it keeps its keys.

## The worker

The worker crawls every package a client asks for that the catalogue does not hold, and what its releases require or
run in, as far down as they go: every version that Foundry VTT's index, GitHub and GitLab list, each loaded from its
own manifest. It saves even a package no source knows, so that it is not asked for again; what could not be fetched is
kept as the package's gaps, which the universe gives. A crawl that fails is tried again after a minute, then after
twice as long each time, to a day at most. Foundry VTT's builds are fetched from its release notes once a day.

Every hour (`REFRESH_MINUTES`), the worker reads Foundry VTT's index and crawls again each package it holds that the
index says has changed. Every package is crawled again a week (`REFRESH_STALE_DAYS`) after it was last synced, whatever
the index says. Each package's own manifest is also read about once an hour (`OWN_MANIFEST_CHECK_MINUTES`), checking
those due every five minutes, and the package crawled again if it gives a version not held: some authors publish by
their manifest alone, as Foundry VTT's updater reads it, and the index does not change. A manifest that has not changed
costs its server only a `304`. A refresh fetches only new versions' manifests: what it loaded before, it keeps.

The worker also warms the catalogue: each hour it queues every package Foundry VTT's index lists, and has not archived,
that it does not hold yet, and crawls up to `WARM_PER_HOUR` of them an hour (300 by default), after everything else on
the queue. The first time, that is about 6,700 packages, so about a day; after that, only packages newly listed. Set
`WARM_PER_HOUR=0` in `.env` to turn warming off, so that the catalogue holds only what clients have needed.

The worker crawls `CRAWL_CONCURRENCY` packages at once (4 by default), making at most `CRAWL_PER_HOST` requests to any
one host at once across them all (4 by default), so that GitHub's API or a package's host is never asked many times
at once. Each crawl may make at most `CRAWL_MAX_REQUESTS` requests (5000 by default). Stopping the container lets it
finish the packages in hand, for up to a minute; a package left unfinished, as when the container is killed, is crawled
again an hour later.

To work through the queue once, by hand, and exit: `docker compose run --rm worker node build/worker/main.js drain`.

To crawl every package held again, as after an upgrade that crawls differently: `docker compose run --rm worker node
build/worker/main.js recrawl`. It queues them and exits, and the running worker crawls them, a package at a time. A
crawl keeps each version it loaded before, so it fetches little more than the listings, and gives each version what
the sources say of it now, such as a manifest URL of its own that it had none of.

The worker has no health check: the image's asks the server, which only `app` runs. Its log says what it does.

### Package overrides

Some packages' sources mislead the catalogue: a listing may give every version the manifest URL of the newest, so the
older versions cannot be loaded, or a source may list a test build as a release. What the catalogue is told of such
packages is kept in `packages/catalogue/overrides.json`, which the image ships and changes, like code, by a pull
request. Each entry is keyed by the package (`module:<id>` or `system:<id>`) and must say why it is needed:

```json
{
  "module:baileywiki-content": {
    "reason": "The listing gives every version the newest's manifest URL; each has its own at v<version>/module.json.",
    "manifest": "https://download.bailey.wiki/bcm/v{version}/module.json"
  },
  "module:multi-token-edit": {
    "reason": "The GitHub release 99.test is a test build.",
    "ignoreVersions": ["99.test"]
  }
}
```

- `manifest`: each version's own manifest URL, with `{version}` for the version as listed. The release is loaded from
  it in place of the manifest its listing gives, and offers it as its own version's manifest, which EMMA's plan gives
  as the URL to install that version from.
- `ignoreVersions`: versions the sources list that are not releases of the package, which are left out.
- `gone`: `true` when the package's files are no longer there, such as when its repository was deleted, though Foundry
  VTT still lists it. None of it is fetched; whatever was held of it is removed, and the universe names it as
  `unavailable`, with the reason as its note. It cannot be given with the other two.

A package whose listing Foundry VTT's index marks `archived` is still crawled: Foundry VTT's Setup screen no longer
offers it, but it installs it from a manifest that names it, as a module that requires it gives. Only when none of its
releases loads, and nothing failed that may succeed later, does the universe name it as `unavailable` because it is
archived. The hourly refresh crawls a package held so again when the index no longer archives it.

The worker reads the file when it starts, and stops at once if it is not valid, naming each problem. When it starts, it
queues every package it holds that has an override to be crawled again, so a changed override applies straight away;
a package with an override that the catalogue does not hold yet is left until a client asks for it. To use another
file, such as to try a fix before it is released, mount it in the worker's container and set `PACKAGE_OVERRIDES_FILE`
to its path. Removing an override does not crawl its package again: it takes effect at the package's next refresh.

## Upgrading

Set `CATALOGUE_TAG`, then `docker compose pull && docker compose up -d`. The migration runs again first; it applies only
what the database does not have yet.

An upgrade does not crawl the packages held again, except those with overrides: each waits for its next refresh. When
the release notes say a release crawls differently, run `recrawl` (see [the worker](#the-worker)) once it is up. 0.5.0
does: with resolver 0.9, premium packages' versions get a manifest URL of their own, such as Epic Rolls 5e 6.1.0's.
So does the release with resolver 0.9.1, which reads tags such as Pathfinder's `pf2e-8.6.1` as `8.6.1`: a recrawl saves
those versions afresh, and removes the ones an older resolver misread, such as `2e-8.6.1`, which could never be loaded.

## Rotating an API key

1. Add the new key to `API_KEYS`, beside the old one, and `docker compose up -d app`.
2. Move the clients to the new key (for EMMA, in its release build).
3. Once no client uses the old key, remove it and `docker compose up -d app` again.

## Logs

Every process logs one JSON object per line to standard output: `docker compose logs app`, or `worker`; the worker
logs each job it does, with how many requests it made. Each request is logged
once, with its `requestId`, which error responses carry too.
