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
(`OPTIONS`) without a key, allowing `GET` with the `X-API-Key`, `X-Catalogue-Client` and `Content-Type` headers.

## Endpoints

`GET /api/v1/packages/{type}/{id}/releases`
: Every release of a package that the catalogue knows: `{ package, releases, asOf }`. Each release is what
  `@mondarth/fvtt-resolver` reads as a `Release`. `type` is `module`, `system` or `world`. `asOf` is when the
  releases were last brought up to date.

`GET /api/v1/status`
: What the catalogue holds: `{ apiVersion, version, packages, releases, asOf }`.

`GET /healthz`
: `{ "status": "ok" }` while the server is up. It needs no key and does not touch the database.

```{todo}
`POST /api/v1/universe`: a set of packages and everything they need, in one answer. A package the catalogue does not
know is queued for the worker to fetch.
```

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
