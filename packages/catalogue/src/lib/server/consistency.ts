/**
 * Consistency: how what the catalogue holds compares with Foundry VTT's index, so that the catalogue can stand in for
 * the index and say how far it does. The rules are a pure function, over what the store gives; the worker checks once a
 * day, keeps the report for `/status`, and queues the packages concerned to be crawled again.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { sameVersion } from '@mondarth/fvtt-resolver';

import { ignores } from './overrides.js';

import type { Compatibility, PackageRef, UnavailableReason } from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageOverrides } from './overrides.js';
import type { ListedVersion } from './refresh.js';

/** A package on the catalogue's copy of the index, as far as the check goes. */
export interface IndexedPackage {
  readonly ref: PackageRef;
  readonly archived: boolean;
  /** The newest version, where the index gives it. */
  readonly latestVersion: string | null;
  /** A version for each line of builds, as the index lists them. */
  readonly versions: readonly ListedVersion[];
}

/** A package the catalogue holds, as far as the check goes. */
export interface CheckedPackage {
  readonly ref: PackageRef;
  readonly unavailable: UnavailableReason | null;
  /** The version its own manifest last gave, if it was read. */
  readonly ownVersion: string | null;
  /** Its releases: each version, with the core compatibility the index's listing gave it, if any. */
  readonly releases: readonly { readonly version: string; readonly listing?: Compatibility }[];
}

/** What the check found: the counts of the report, and the packages to crawl again. */
export interface Findings {
  readonly listed: number;
  readonly held: number;
  readonly versionsMissing: number;
  readonly latestMissing: number;
  readonly listingsDiffer: number;
  readonly archivedHeld: number;
  readonly ownMissing: number;
  /** The packages concerned, each once, in the index's order, then those off it. */
  readonly concerned: PackageRef[];
}

/** Whether a listing's bound and the index's are the same: both none, or the same text. */
const sameBound = (held: string | undefined, indexed: string | null) => (held ?? null) === indexed;

/**
 * Compares what the catalogue holds with its copy of Foundry VTT's index. A version an override says is not a release
 * is not looked for. A release whose listing the catalogue does not hold, as one only a forge lists, is not compared.
 *
 * @param indexed - The packages the index lists, not delisted
 * @param held - The packages the catalogue holds
 * @param overrides - What the catalogue is told of packages whose sources mislead it
 * @returns The counts, and the packages concerned
 */
export function checkConsistency(
  indexed: readonly IndexedPackage[],
  held: readonly CheckedPackage[],
  overrides: PackageOverrides,
): Findings {
  const byKey = new Map(held.map(pkg => [packageKey(pkg.ref), pkg]));
  const concerned = new Map<string, PackageRef>();
  const concern = (ref: PackageRef) => concerned.set(packageKey(ref), ref);
  let listed = 0;
  let heldListed = 0;
  let versionsMissing = 0;
  let latestMissing = 0;
  let listingsDiffer = 0;
  let archivedHeld = 0;
  let ownMissing = 0;

  for (const entry of indexed) {
    const pkg = byKey.get(packageKey(entry.ref));
    if (entry.archived) {
      // Counted, but no concern: one archived is held while a manifest still gives it, as Foundry VTT installs it so.
      if (pkg?.unavailable === null) archivedHeld++;
      continue;
    }
    listed++;
    if (pkg === undefined) continue;
    heldListed++;
    if (pkg.unavailable !== null) continue;
    const override = overrides[packageKey(entry.ref)];
    const releaseOf = (version: string) => pkg.releases.find(release => sameVersion(release.version, version));
    for (const version of entry.versions) {
      if (ignores(override, version.version)) continue;
      const release = releaseOf(version.version);
      if (release === undefined) {
        versionsMissing++;
        concern(entry.ref);
      } else if (
        release.listing !== undefined &&
        !(sameBound(release.listing.minimum, version.minimum) && sameBound(release.listing.verified, version.verified))
      ) {
        listingsDiffer++;
        concern(entry.ref);
      }
    }
    const latest = entry.latestVersion;
    if (latest !== null && !ignores(override, latest) && releaseOf(latest) === undefined) {
      latestMissing++;
      concern(entry.ref);
    }
  }

  // A version only a package's own manifest gives, as one its author published by the manifest alone, on the index or
  // not.
  for (const pkg of held) {
    const { ownVersion } = pkg;
    if (pkg.unavailable !== null || ownVersion === null) continue;
    if (ignores(overrides[packageKey(pkg.ref)], ownVersion)) continue;
    if (!pkg.releases.some(release => sameVersion(release.version, ownVersion))) {
      ownMissing++;
      concern(pkg.ref);
    }
  }

  return {
    listed,
    held: heldListed,
    versionsMissing,
    latestMissing,
    listingsDiffer,
    archivedHeld,
    ownMissing,
    concerned: [...concerned.values()],
  };
}
