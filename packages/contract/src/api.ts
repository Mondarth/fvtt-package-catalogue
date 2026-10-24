/**
 * The HTTP API: where each answer is, how to authenticate, and the shape of every response.
 */
import { z } from 'zod';

import { PackageRef } from './package.js';
import { Release } from './release.js';

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

/** When the answer's data was last brought up to date, as an ISO 8601 time, or null if never. */
const AsOf = z.iso.datetime().nullable();

/** `GET /api/v1/packages/:type/:id/releases`: every release of a package the catalogue knows. */
export const ReleasesResponse = z.object({
  package: PackageRef,
  releases: z.array(Release),
  asOf: AsOf,
});
export type ReleasesResponse = z.infer<typeof ReleasesResponse>;

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
