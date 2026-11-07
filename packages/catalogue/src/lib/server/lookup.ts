/**
 * Lookups, version 2's universe: a set of packages and everything they need, each package once with its releases and
 * how fresh they are, so that a client such as EMMA needs to ask the catalogue nothing more. What the catalogue does
 * not hold is queued, with the manifest URL the client gave, which is how a package installed by its manifest alone is
 * found.
 */
import { PackageRelease, packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { sameVersion } from '@mondarth/fvtt-resolver';

import { gatherUniverse } from './universe.js';

import type {
  LookupRequest,
  LookupResponse,
  PackageRef,
  Release,
  SourceGap,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { CatalogueStore } from './store/types.js';

/** How long a client waits before asking again for a package queued: about as long as the worker takes to crawl one. */
export const RETRY_AFTER_SECONDS = 30;

/**
 * Whether a release may run on a build of a generation or a later one, by the `maximum` it declares: one that declares
 * none, or one that cannot be read, may.
 *
 * @param release - The release
 * @param generation - The generation
 * @returns Whether it may
 */
export function mayRunFrom(release: Release, generation: number): boolean {
  const { maximum } = release.compatibility;
  if (maximum === undefined) return true;
  const declared = Number.parseInt(maximum, 10);
  return Number.isNaN(declared) || declared >= generation;
}

/** The packages whose sources could not all be listed at their last crawl: gaps of no one version. */
const unreachedOf = (gaps: readonly SourceGap[], held: ReadonlyMap<string, PackageRef>): PackageRef[] => [
  ...new Map(
    gaps.flatMap(gap => {
      const ref = gap.version === undefined && gap.package !== undefined ? held.get(gap.package) : undefined;
      return ref === undefined ? [] : [[packageKey(ref), ref] as const];
    }),
  ).values(),
];

/**
 * Looks up some packages: their releases and those of everything they need, as `gatherUniverse` gathers them, with
 * those `fromGeneration` leaves out left out but for the versions installed; each package with its listing's title,
 * newest version and premium flag, when it was synced, and what its own manifest last gave.
 *
 * @param store - The catalogue
 * @param request - What was asked
 * @param now - The time now, to tell a package held with no releases that is due to be crawled again
 * @returns The answer, in the contract's shape
 */
export async function lookUp(
  store: CatalogueStore,
  { packages, fromGeneration }: LookupRequest,
  now: Date = new Date(),
): Promise<LookupResponse> {
  const installed = new Map(
    packages.flatMap(({ type, id, installed: version }) =>
      version === undefined ? [] : [[packageKey({ type, id }), version] as const],
    ),
  );
  const hints = new Map(
    packages.flatMap(({ type, id, manifest }) =>
      manifest === undefined ? [] : [[packageKey({ type, id }), manifest] as const],
    ),
  );
  const keep = (release: Release) => {
    if (fromGeneration === undefined || mayRunFrom(release, fromGeneration)) return true;
    const version = installed.get(packageKey(release.package));
    return version !== undefined && sameVersion(version, release.version);
  };
  const roots = packages.map(({ type, id }) => ({ type, id }));
  const found = await gatherUniverse(store, roots, { keep, hints, now });

  // Each package held, in the order met, those asked for first: one with no release kept is still given, as held.
  const held = new Map(found.held.map(ref => [packageKey(ref), ref]));
  const releasesOf = Map.groupBy(found.universe.releases, release => packageKey(release.package));
  const details = await store.detailsOf(found.held);

  return {
    core: found.universe.core,
    packages: [...held].map(([key, ref]) => {
      const about = details.get(key);
      return {
        package: ref,
        title: about?.title ?? null,
        latest: about?.latest ?? null,
        premium: about?.premium ?? false,
        syncedAt: about?.syncedAt?.toISOString() ?? null,
        own: {
          version: about?.ownVersion ?? null,
          readAt: about?.ownReadAt?.toISOString() ?? null,
          checkedAt: about?.ownCheckedAt?.toISOString() ?? null,
        },
        // Without its package, which is given once, with the package.
        releases: (releasesOf.get(key) ?? []).map(release => PackageRelease.parse(release)),
      };
    }),
    pending: found.pending.map(ref => ({ package: ref, retryAfter: RETRY_AFTER_SECONDS })),
    unavailable: found.unavailable,
    unreached: unreachedOf(found.gaps, held),
    asOf: found.asOf?.toISOString() ?? null,
  };
}
