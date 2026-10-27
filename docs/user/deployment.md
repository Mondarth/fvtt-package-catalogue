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

## The worker

The worker crawls every package a client asks for that the catalogue does not hold, and what its releases require or
run in, as far down as they go: every version that Foundry VTT's index, GitHub and GitLab list, each loaded from its
own manifest. It saves even a package no source knows, so that it is not asked for again; what could not be fetched is
kept as the package's gaps, which the universe gives. A crawl that fails is tried again after a minute, then after
twice as long each time, to a day at most. Foundry VTT's builds are fetched from its release notes once a day.

Every hour (`REFRESH_MINUTES`), the worker reads Foundry VTT's index and crawls again each package it holds that the
index says has changed. A package the index does not list is crawled again a week (`REFRESH_STALE_DAYS`) after it was
last synced. A refresh fetches only new versions' manifests: what it loaded before, it keeps.

Each crawl may make at most `CRAWL_MAX_REQUESTS` requests (5000 by default). Stopping the container lets it finish the
package in hand, for up to a minute.

To work through the queue once, by hand, and exit: `docker compose run --rm worker node build/worker/main.js drain`.

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

The worker reads the file when it starts, and stops at once if it is not valid, naming each problem. When it starts, it
queues every package it holds that has an override to be crawled again, so a changed override applies straight away;
a package with an override that the catalogue does not hold yet is left until a client asks for it. To use another
file, such as to try a fix before it is released, mount it in the worker's container and set `PACKAGE_OVERRIDES_FILE`
to its path. Removing an override does not crawl its package again: it takes effect at the package's next refresh.

## Upgrading

Set `CATALOGUE_TAG`, then `docker compose pull && docker compose up -d`. The migration runs again first; it applies only
what the database does not have yet.

## Rotating an API key

1. Add the new key to `API_KEYS`, beside the old one, and `docker compose up -d app`.
2. Move the clients to the new key (for EMMA, in its release build).
3. Once no client uses the old key, remove it and `docker compose up -d app` again.

## Logs

Every process logs one JSON object per line to standard output: `docker compose logs app`, or `worker`; the worker
logs each job it does, with how many requests it made. Each request is logged
once, with its `requestId`, which error responses carry too.
