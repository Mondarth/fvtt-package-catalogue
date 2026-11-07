/**
 * The HTTP API, whatever its version: how to authenticate, and what every version's answers share. Each version's
 * endpoints are in their own module (see `v2.ts`).
 */
import { z } from 'zod';

import { PackageRef } from './package.js';

/**
 * The header that carries the API key. Every API request needs one, except the CORS preflight.
 * The key identifies a client rather than protecting the data, which is public.
 */
export const API_KEY_HEADER = 'X-API-Key';

/** The header a client names itself and its version in, such as `EMMA/0.6.0`. Optional. */
export const CLIENT_HEADER = 'X-Catalogue-Client';

/**
 * The most packages a lookup may start from: far more than the modules any world enables, which for a heavily modded
 * world can be several hundred, while still refusing an absurd request before it is walked. What a lookup costs depends
 * on its closure, not on how many packages it starts from.
 */
export const MAX_UNIVERSE_PACKAGES = 1000;

/** When the answer's data was last brought up to date, as an ISO 8601 time, or null if never. */
export const AsOf = z.iso.datetime().nullable();

/**
 * Why a package cannot be had: `archived`, Foundry VTT's listing of it is archived, so its Setup screen no longer offers
 * it; `gone`, its files are no longer there, as the catalogue's maintainers found.
 */
export const UnavailableReason = z.enum(['archived', 'gone']);
export type UnavailableReason = z.infer<typeof UnavailableReason>;

/** A package the catalogue knows cannot be had, so offers no releases of. */
export const UnavailablePackage = z.object({
  package: PackageRef,
  reason: UnavailableReason,
  /** More of why, in words, such as what the maintainers found. */
  note: z.string().min(1).exactOptional(),
});
export type UnavailablePackage = z.infer<typeof UnavailablePackage>;

/** A count of none or more. */
export const Count = z.int().nonnegative();

/**
 * How what the catalogue holds compares with Foundry VTT's index, as the catalogue last checked, once a day. Each count
 * but the first two is of something to put right; the catalogue queues the packages concerned to be crawled again.
 */
export const ConsistencyReport = z.object({
  /** When it was checked. */
  at: z.iso.datetime(),
  /** The packages the index lists, and has not archived. */
  listed: Count,
  /** Of those, the packages the catalogue holds. */
  held: Count,
  /** Versions the index lists of a package held that the catalogue does not hold. */
  versionsMissing: Count,
  /** Packages held whose newest version, where the index gives it, the catalogue does not hold. */
  latestMissing: Count,
  /** Releases held whose core compatibility, as the index lists it, is not what the catalogue holds. */
  listingsDiffer: Count,
  /** Packages the index has archived that the catalogue holds as available. */
  archivedHeld: Count,
  /** Packages whose own manifest last gave a version the catalogue does not hold. */
  ownMissing: Count,
  /** The packages queued to be crawled again for these. */
  requeued: Count,
});
export type ConsistencyReport = z.infer<typeof ConsistencyReport>;

/** `GET /healthz`: the server is up. It is under no version of the API, and needs no key. */
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
