# The API

Every endpoint is under `/api/v1`, and answers in JSON. The schema of every request and response is in the
[contract](https://www.npmjs.com/package/@mondarth/fvtt-package-catalogue-contract), as zod schemas a client can
validate with.

## API keys

Every request needs a key, in the `X-API-Key` header, except the CORS preflight and `GET /healthz`:

```shell
curl -H "X-API-Key: $KEY" https://catalogue.example.com/api/v1/status
```

As with EMMA's default proxy, a key ships inside the clients that use it, so it cannot be kept secret. It identifies a
client and keeps out traffic that is not theirs; the data is public. The server accepts several keys at once
(`API_KEYS`), so that a key can be replaced while clients move to the new one.

A client may name itself in `X-Catalogue-Client`, such as `EMMA/0.6.0`. It is logged with the request.

## CORS

Any origin may call the API, since Foundry VTT runs wherever its users host it. The server answers the preflight
(`OPTIONS`) without a key, allowing `GET` and `POST` with the `X-API-Key`, `X-Catalogue-Client` and `Content-Type` headers.

## Endpoints

`GET /api/v1/packages/{type}/{id}/releases`
: Every release of a package that the catalogue knows: `{ package, releases, asOf }`. Each release is what
  `@mondarth/fvtt-resolver` reads as a `Release`. `type` is `module`, `system` or `world`. `asOf` is when the
  releases were last brought up to date. A release newer than any Foundry VTT's package listing offers, such as one
  published on GitLab first, is included with `"unlisted": true`: Foundry VTT's users cannot install it from the
  listing, so the resolver chooses one only when no listed version fits, and a client should say what it is.

`GET /api/v1/status`
: What the catalogue holds: `{ apiVersion, version, packages, releases, asOf }`.

`GET /healthz`
: `{ "status": "ok" }` while the server is up. It needs no key and does not touch the database.

`POST /api/v1/universe`
: A set of packages and everything they need, in one answer. The body names up to 1000 packages to start from, such as
  those a world has enabled:

  ```json
  { "packages": [{ "type": "module", "id": "midi-qol" }] }
  ```

  The answer is `{ universe, gaps, pending, asOf }`:

  - `universe`: `{ core, releases }`, what `@mondarth/fvtt-resolver` reads as a `Universe`. `releases` holds every
    release of the packages asked for, and of every package any of those releases requires or runs in, all the way
    down. What releases conflict with or recommend is not followed, nor are worlds, as the resolver does not follow them
    either. `core` is every build of Foundry VTT the catalogue knows, oldest first.
  - `gaps`: what the catalogue's sources could not fetch or read for these packages.
  - `pending`: packages asked for or needed that the catalogue does not hold yet. Each is queued for the worker to
    fetch; until then, a client finds them elsewhere, such as through EMMA's proxy, and asks again later.
  - `asOf`: the oldest time any package held was brought up to date, or `null` if none is held.

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
