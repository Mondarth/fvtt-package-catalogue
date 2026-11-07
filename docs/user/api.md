# The API

Every endpoint is under `/api/v2`, and answers in JSON. Version 2 is for clients that ask the catalogue alone, such as
EMMA, as few times as they can. Version 1 (`/api/v1`, its releases, universe and status) is retired: every Mondarth
client asks version 2. The schema of every request and response is in the
[contract](https://www.npmjs.com/package/@mondarth/fvtt-package-catalogue-contract), as zod schemas a client can
validate with.

## API keys

Every request needs a key, in the `X-API-Key` header, except the CORS preflight and `GET /healthz`:

```shell
curl -H "X-API-Key: $KEY" https://catalogue.example.com/api/v2/status
```

As with EMMA's default proxy, a key ships inside the clients that use it, so it cannot be kept secret. It identifies a
client and keeps out traffic that is not theirs; the data is public. The server accepts several keys at once
(`API_KEYS`), so that a key can be replaced while clients move to the new one.

A client may name itself in `X-Catalogue-Client`, such as `EMMA/0.6.0`. It is logged with the request.

## CORS

Any origin may call the API, since Foundry VTT runs wherever its users host it. The server answers the preflight
(`OPTIONS`) without a key, allowing `GET` and `POST` with the `X-API-Key`, `X-Catalogue-Client`, `Content-Type` and `If-None-Match` headers, and
lets it read the `ETag`.

## Endpoints

`POST /api/v2/lookup`
: A set of packages, such as those installed, and every package their releases require or run in, all the way down,
  each once: `{ packages: [{ type, id, installed?, manifest? }], fromGeneration? }`, at most 1000 packages. The answer
  is `{ core, packages, pending, unavailable, unreached, asOf }`:

  - `packages`: each package held, those asked for first, as `{ package, title, latest, premium, syncedAt, own,
    releases }`. Each release is what `@mondarth/fvtt-resolver` reads as a `Release`, without its `package`. A release
    newer than any Foundry VTT's package listing offers, such as one published on GitLab first, is included with
    `"unlisted": true`: Foundry VTT's users cannot install it from the listing, so the resolver chooses one only when
    no listed version fits, and a client should say what it is. `title`, `latest` (the newest version,
    where Foundry VTT's listing gives it) and `premium` are the listing's. `syncedAt` is when its releases were last
    brought up to date; `own` is what its own manifest last gave, `{ version, readAt, checkedAt }`, checked about
    hourly, so a client can say how fresh it is.
  - `fromGeneration`, if given, leaves out releases whose declared `maximum` is of an older generation of Foundry VTT,
    so cannot run on a build of that generation or later, and so what only they need, but for the version `installed`.
  - `pending`: packages the catalogue does not hold yet, each `{ package, retryAfter }`: it queues them, found by the
    `manifest` given, if any, so a package installed by its manifest alone is found too; asking again after
    `retryAfter` seconds may find them.
  - `unavailable`: packages that cannot be had, each `{ package, reason, note? }`. The `reason` is `archived`, when
    Foundry VTT's listing of the package is archived and none of its releases loads, or `gone`, when the catalogue's
    maintainers found its files are no longer there; `note` says more, in words. None of their releases are given, and
    what they need is not followed. `unreached`: packages whose sources could not all be
    listed when they were last brought up to date, so may have newer versions not held.

`POST /api/v2/manifest`
: Reads a manifest URL a user gives, to install a package from: `{ url, type }`, `type` `module` or `system`. The
  answer is `{ ok: true, title, release }`, the release with the URL as its manifest, for its version alone, since what
  it gives is what the user chose; or `{ ok: false, problem }`: `unreadable`, with a `reason` (`http` with its
  `status`, `network`, `invalid`, `refused` or `too-large`) and the `host`; `other-type`, a manifest of the other
  `type`, which Foundry VTT would install as the type asked; or `not-manifest`. The package is queued, found by the URL.
  The catalogue fetches the URL itself, so it refuses what only it could reach: a host that is, or resolves to, a
  private, local or reserved address, checked as each connection is made; a port other than 80 or 443; more than three
  redirects; more than 1 MB; more than ten seconds.

`POST /api/v2/recheck`
: Checks packages' own manifests again now, as a client's "check live" asks, rather than at the catalogue's next
  hourly check: `{ packages: [{ type, id }] }`, at most 50. The answer is `{ packages, pending }`: each package asked
  for that the catalogue holds, and can be had, once, as `{ package, own, changed }`, where `own` is as a lookup gives
  it, now; and the packages whose manifest gave a version the catalogue does not hold, queued to be crawled, as a
  lookup gives those pending, to look up again after `retryAfter`. A package checked in the last five minutes is given
  as it was then, without asking its server, however many clients ask. A package not held is left out: look it up.

`GET /api/v2/listing`, or `?type=module` or `?type=system`
: Every package Foundry VTT's listing offers to install, as the catalogue keeps it, neither archived nor delisted:
  `{ packages, asOf }`, each package `{ package, title, summary, author, url, tags, systems, premium, exclusive,
  latest, versions }`, where `versions` gives the newest version of each line of builds the listing lists, with its
  `minimum`, `maximum`, `verified`, `manifest` and `notes`. It is the same for every client, so it comes with an `ETag`
  and `Cache-Control: max-age=300`: a client that sends the ETag back in `If-None-Match` is answered `304` while the
  listing has not changed. Whether the user owns a premium package is not the catalogue's to know: Foundry VTT says.

`GET /api/v2/core`
: Foundry VTT's builds, oldest first: `{ core }`, with an `ETag` and `Cache-Control: max-age=3600`, as the listing.

`GET /api/v2/status`
: What the catalogue holds: `{ apiVersion, version, packages, releases, asOf, consistency }`. `consistency` is how it
  last compared with Foundry VTT's index, once a day, or `null` if it has not yet: `at`; `listed`, the packages the
  index lists and has not archived, and `held`, how many of them the catalogue holds; then what is to be put right:
  `versionsMissing` (versions the index lists of a package held that it does not hold), `latestMissing` (packages
  whose newest version, where the index gives it, it does not hold), `listingsDiffer` (releases whose core
  compatibility on the index is not what it holds), `archivedHeld` (packages the index archived that it holds as
  available, as a manifest still gives them: counted, but nothing to put right) and `ownMissing` (packages whose own manifest gave a version it does not hold); and `requeued`, how many
  of the packages concerned it queued to crawl again, at most 500.

`GET /healthz`
: `{ "status": "ok" }` while the server is up. It needs no key and does not touch the database.

## Errors

Every error has the same body:

```json
{ "error": { "code": "not-found", "message": "The catalogue does not know module:x", "requestId": "…" } }
```

| Code                 | Status | When                                                     |
| -------------------- | -----: | -------------------------------------------------------- |
| `bad-request`        |    400 | The request is malformed, such as an impossible id       |
| `unauthorised`       |    401 | No `X-API-Key`, or one the server does not accept        |
| `not-found`          |    404 | No such package, or no such endpoint                     |
| `method-not-allowed` |    405 | The endpoint does not take that method                  |
| `rate-limited`       |    429 | Too many requests                                        |
| `internal`           |    500 | Something went wrong in the catalogue                    |
| `unavailable`        |    503 | The catalogue cannot answer for now                      |

The `requestId` identifies the request in the server's logs: give it when reporting a problem.
