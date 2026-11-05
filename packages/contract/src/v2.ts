/**
 * Version 2 of the HTTP API: answers shaped for clients that ask the catalogue alone, such as EMMA, as few times as
 * they can. Version 1 is kept until every Mondarth client asks version 2.
 */
import { z } from 'zod';

import { MAX_UNIVERSE_PACKAGES, UnavailablePackage } from './api.js';
import { CoreRelease } from './core.js';
import { PackageRef } from './package.js';
import { Release, Version } from './release.js';

/** The version of the API these schemas describe; part of every path. */
export const API_V2_VERSION = 'v2';

/** The path every endpoint of version 2 is under. */
export const API_V2_BASE = `/api/${API_V2_VERSION}`;

/** The path of a lookup: a set of packages, everything they need, and how fresh each is. */
export const LOOKUP_PATH = `${API_V2_BASE}/lookup`;

/** A time, as ISO 8601, or null for never. */
const Time = z.iso.datetime().nullable();

/** A package to look up, with what the client knows of it. */
export const LookupPackageRequest = PackageRef.extend({
  /** The version installed, which is given whatever `fromGeneration` leaves out. */
  installed: Version.exactOptional(),
  /**
   * The manifest URL it was installed from: a package the catalogue does not hold is found by it, as one installed
   * from a manifest alone is found by nothing else.
   */
  manifest: z.url().exactOptional(),
});
export type LookupPackageRequest = z.infer<typeof LookupPackageRequest>;

/** `POST /api/v2/lookup`: the packages to start from, such as those installed. */
export const LookupRequest = z.object({
  packages: z.array(LookupPackageRequest).min(1).max(MAX_UNIVERSE_PACKAGES),
  /**
   * Only releases that may run on a build of this generation of Foundry VTT or a later one, by the `maximum` they
   * declare, and the versions installed: what a client on that generation can choose from. Every release when left out.
   */
  fromGeneration: z.int().positive().exactOptional(),
});
export type LookupRequest = z.infer<typeof LookupRequest>;

/** A release of a package given with its package: the package is not given again. */
export const PackageRelease = Release.omit({ package: true });
export type PackageRelease = z.infer<typeof PackageRelease>;

/**
 * What the catalogue last found in a package's own manifest, as Foundry VTT's updater reads it: the version it gave,
 * when it was last read, and when it was last tried. A client that wants it fresher asks for it to be checked again.
 */
export const OwnManifest = z.object({
  version: Version.nullable(),
  readAt: Time,
  checkedAt: Time,
});
export type OwnManifest = z.infer<typeof OwnManifest>;

/** A package looked up, or needed by one, with its releases and how fresh they are. */
export const LookupPackage = z.object({
  package: PackageRef,
  /** Its title, as Foundry VTT's listing gives it; null if it is not listed. */
  title: z.string().nullable(),
  /** The newest version, where Foundry VTT's listing gives it, which it does for few packages. */
  latest: Version.nullable(),
  /** Premium content: installing it needs the user's licence. */
  premium: z.boolean(),
  /** When its releases were last brought up to date. */
  syncedAt: Time,
  own: OwnManifest,
  releases: z.array(PackageRelease),
});
export type LookupPackage = z.infer<typeof LookupPackage>;

/** A package the catalogue does not hold yet, queued for it to fetch, and when to ask again. */
export const PendingPackage = z.object({
  package: PackageRef,
  /** Seconds after which asking again may find it. */
  retryAfter: z.int().positive(),
});
export type PendingPackage = z.infer<typeof PendingPackage>;

/**
 * `POST /api/v2/lookup`: the packages asked for and every package their releases require or run in, each once, with its
 * releases, as far as the catalogue holds them; with Foundry VTT's builds.
 */
export const LookupResponse = z.object({
  core: z.array(CoreRelease),
  packages: z.array(LookupPackage),
  /** Packages asked for or needed that the catalogue does not hold yet. */
  pending: z.array(PendingPackage),
  /** Packages asked for or needed that cannot be had, with no releases, and not followed further. */
  unavailable: z.array(UnavailablePackage),
  /**
   * Packages held whose sources could not all be listed when they were last brought up to date, so may have newer
   * versions the catalogue does not hold.
   */
  unreached: z.array(PackageRef),
  /** The oldest time any of the packages held was brought up to date. */
  asOf: Time,
});
export type LookupResponse = z.infer<typeof LookupResponse>;
