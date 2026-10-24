/**
 * The HTTP API: where each answer is, how to authenticate, and the shape of every response.
 */
import { z } from 'zod';

import { PackageRef } from './package.js';
import { Release } from './release.js';
import { SourceGap, Universe } from './universe.js';

/** The version of the API these schemas describe; part of every path. */
export const API_VERSION = 'v1';

/** The path every endpoint of this API version is under. */
export const API_BASE = `/api/${API_VERSION}`;

/**
 * The header that carries the API key. Every API request needs one, except the CORS preflight.
 * The key identifies a client rather than protecting the data, which is public.
 */
export const API_KEY_HEADER = 'X-API-Key';

/** The header a client names itself and its version in, such as `EMMA/0.6.0`. Optional. */
export const CLIENT_HEADER = 'X-Catalogue-Client';

/**
 * The path of a package's releases.
 *
 * @param ref - The package
 * @returns The path, under {@link API_BASE}
 */
export function releasesPath({ type, id }: PackageRef): string {
  return `${API_BASE}/packages/${type}/${encodeURIComponent(id)}/releases`;
}

/** The path of the universe: a set of packages and everything they need. */
export const UNIVERSE_PATH = `${API_BASE}/universe`;

/** The most packages a {@link UniverseRequest} may start from. */
export const MAX_UNIVERSE_PACKAGES = 100;

/** When the answer's data was last brought up to date, as an ISO 8601 time, or null if never. */
const AsOf = z.iso.datetime().nullable();

/** `GET /api/v1/packages/:type/:id/releases`: every release of a package the catalogue knows. */
export const ReleasesResponse = z.object({
  package: PackageRef,
  releases: z.array(Release),
  asOf: AsOf,
});
export type ReleasesResponse = z.infer<typeof ReleasesResponse>;

/** `POST /api/v1/universe`: the packages to start from, such as those a world has enabled. */
export const UniverseRequest = z.object({
  packages: z.array(PackageRef).min(1).max(MAX_UNIVERSE_PACKAGES),
});
export type UniverseRequest = z.infer<typeof UniverseRequest>;

/**
 * `POST /api/v1/universe`: the packages asked for and every package their releases require or run in, as far as the
 * catalogue holds them, with Foundry VTT's builds.
 */
export const UniverseResponse = z.object({
  universe: Universe,
  /** What the catalogue's sources could not fetch or read for these packages. */
  gaps: z.array(SourceGap),
  /**
   * Packages asked for or needed that the catalogue does not hold yet. They are queued for it to fetch; until then, a
   * client finds them elsewhere, such as through EMMA's proxy.
   */
  pending: z.array(PackageRef),
  /** The oldest time any of the packages held was brought up to date. */
  asOf: AsOf,
});
export type UniverseResponse = z.infer<typeof UniverseResponse>;

/** `GET /api/v1/status`: what the catalogue holds. */
export const StatusResponse = z.object({
  apiVersion: z.literal(API_VERSION),
  /** The catalogue's own release. */
  version: z.string(),
  packages: z.int().nonnegative(),
  releases: z.int().nonnegative(),
  asOf: AsOf,
});
export type StatusResponse = z.infer<typeof StatusResponse>;

/** `GET /healthz`: the server is up. It is not under {@link API_BASE}, and needs no key. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Why a request failed. */
export const ErrorCode = z.enum([
  'bad-request',
  'unauthorised',
  'not-found',
  'method-not-allowed',
  'rate-limited',
  'unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** The body of every error response. */
export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** Identifies the request in the server's logs. */
    requestId: z.string().exactOptional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
