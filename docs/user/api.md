# The API

Every endpoint is under `/api/v2`, and answers in JSON. Version 2 is for clients that ask the catalogue alone, such as
EMMA, as few times as they can. Version 1 (`/api/v1`, its releases, universe and status) is retired: every Mondarth
client asks version 2. The schema of every request and response is in the
[contract](https://www.npmjs.com/package/@mondarth/fvtt-package-catalogue-contract), as zod schemas a client can
validate with.

## Who is asking

Every request says who is asking, except the CORS preflight and `GET /healthz`: with an API key, in the `X-API-Key`
header, or with a signed-in user's token, as `Authorization: Bearer <token>`. The website's session cookie is never
one: the API does not read it.

```shell
curl -H "X-API-Key: $KEY" https://catalogue.example.com/api/v2/status
curl -H "Authorization: Bearer $TOKEN" https://catalogue.example.com/api/v2/me
```

**A key** ships inside the clients that use it, so it cannot be kept secret. It identifies a client and keeps out
traffic that is not theirs; the data is public. The server accepts several keys at once (`API_KEYS`), so that a key can
be replaced while clients move to the new one. A **module's key** (`module:<key>` in `API_KEYS`) reaches only what the
EMMA module calls: lookups, which give Foundry VTT's builds too. A key without the prefix reaches every endpoint but
`/me`, as every key did before keys had kinds; it is kept while EMMA's browser extension calls the API with one, until
it signs its users in.

**A user's token** is the token of their session on the website. It reaches `/me` at any time, and every other
endpoint while they are subscribed, or an admin; otherwise the API answers `subscription-required`, saying when the
subscription ended. The token of a session an admin is viewing the site in, as the user, is refused. Whether a user is
subscribed is checked again at most a minute after it changes.

### Signing a user in from a device

A client running outside the website, such as EMMA's browser extension, gets a user's token by the OAuth 2 device
authorization grant (RFC 8628). Only the clients the catalogue knows may: `emma-extension` for now.

1. Ask for codes: `POST /auth/device/code` with `{ "client_id": "emma-extension" }`. The answer gives a `device_code`,
   to keep to itself, a `user_code`, such as `WDJBMJHT`, the `verification_uri` (`<site>/device`) and
   `verification_uri_complete` (with the code), `expires_in` (600 seconds) and `interval` (5 seconds).
2. Show the user the code, and open `verification_uri_complete` for them. There they sign in, if they have not, see
   which client asks and the code to check, and approve or deny it.
3. Meanwhile poll `POST /auth/device/token` with `{ "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
   "device_code": "…", "client_id": "emma-extension" }`, no more often than `interval`. Until the user decides it
   answers `authorization_pending` (or `slow_down`, if asked too often); then `access_denied`, or the token as
   `access_token`. A code not used within its ten minutes answers `expired_token`.

The token is a session of the user's, which they see in their profile's list of signed-in devices, by the client's
name, and can sign out there. It lasts 30 days, renewed while it is used. An admin viewing the site as a user cannot
approve a device for them.

Each key and each user may make `API_RATE_PER_MINUTE` requests a minute (300 by default); the rest are answered
`rate-limited` until the next minute.

A client may name itself in `X-Catalogue-Client`, such as `EMMA/0.6.0`. It is logged with the request.

## CORS

Any origin may call the API, since Foundry VTT runs wherever its users host it. The server answers the preflight
(`OPTIONS`) without a key, allowing `GET` and `POST` with the `X-API-Key`, `Authorization`, `X-Catalogue-Client`, `Content-Type` and `If-None-Match` headers, and
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
    where Foundry VTT's listing gives it) and `premium` are the listing's; a package the listing does not give a title,
    as one installed by its manifest alone or one archived, has the title its own manifest gave when last read, or
    `null` before it is. `syncedAt` is when its releases were last
    brought up to date; `own` is what its own manifest last gave, `{ version, readAt, checkedAt }`, checked about
    hourly, so a client can say how fresh it is.
  - `fromGeneration`, if given, leaves out releases whose declared `maximum` is of an older generation of Foundry VTT,
    so cannot run on a build of that generation or later, and so what only they need, but for the version `installed`.
  - `pending`: packages the catalogue does not hold yet, or holds with no releases and last crawled more than an hour
    ago, each `{ package, retryAfter }`: it queues them, found by the
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
  lookup gives those pending, to look up again after `retryAfter`; so is a package held with no releases and last crawled
  more than an hour ago, which has no manifest of its own to check. A package checked in the last five minutes is given
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

`GET /api/v2/me`
: Who a user's token is for, and whether they may use the API: `{ user: { handle, nickname, role }, subscription: {
  paidUntil, active }, entitled }`. `role` is `user` or `admin`; `entitled` is whether the token reaches every
  endpoint, subscribed or an admin. It answers whether or not they are subscribed, so that a client can say so, and
  only a user's token, never a key.

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
| `unauthorised`       |    401 | No key or token, or one the server does not accept       |
| `forbidden`          |    403 | A key or token the server accepts, but not for this endpoint |
| `subscription-required` | 403 | A user's token, without a subscription: `paidUntil` says when it ended, or is `null` if there never was one |
| `not-found`          |    404 | No such package, or no such endpoint                     |
| `method-not-allowed` |    405 | The endpoint does not take that method                  |
| `rate-limited`       |    429 | Too many requests                                        |
| `internal`           |    500 | Something went wrong in the catalogue                    |
| `unavailable`        |    503 | The catalogue cannot answer for now                      |

The `requestId` identifies the request in the server's logs: give it when reporting a problem.
