/**
 * The API contract of the Foundry VTT package catalogue: a zod schema, and its type, for every
 * request and response. The catalogue validates what it sends with these; clients, such as
 * `@mondarth/fvtt-resolver`, validate what they receive with them.
 *
 * @packageDocumentation
 */
export { PackageId, PackageRef, PackageType, packageKey } from './package.js';
export { Compatibility, Relationship, Relationships, Release, ReleaseDetail, Version } from './release.js';
export { CoreChannel, CoreRelease } from './core.js';
export { SourceGap, Universe } from './universe.js';
export {
  API_BASE,
  API_KEY_HEADER,
  API_VERSION,
  CLIENT_HEADER,
  ErrorCode,
  ErrorResponse,
  HealthResponse,
  MAX_UNIVERSE_PACKAGES,
  ReleasesResponse,
  StatusResponse,
  UNIVERSE_PATH,
  UnavailablePackage,
  UnavailableReason,
  UniverseRequest,
  UniverseResponse,
  releasesPath,
} from './api.js';
