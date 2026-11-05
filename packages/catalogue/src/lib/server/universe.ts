/**
 * Universes: a set of packages and everything they need, from what the catalogue holds.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';

import type {
  PackageRef,
  Release,
  SourceGap,
  UnavailablePackage,
  Universe,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { CatalogueStore, CrawlRequest } from './store/types.js';

/** A universe, with what is missing from it and how old it is. */
export interface GatheredUniverse {
  readonly universe: Universe;
  readonly gaps: SourceGap[];
  /** Packages asked for or needed that the catalogue holds and can be had, in the order they were met. */
  readonly held: PackageRef[];
  /** Packages asked for or needed that the catalogue does not hold, in the order they were met. */
  readonly pending: PackageRef[];
  /** Packages asked for or needed that cannot be had, in the order they were met: none of their releases are given. */
  readonly unavailable: UnavailablePackage[];
  /** The oldest time a package held was brought up to date; null if one never was, or none is held. */
  readonly asOf: Date | null;
}

/** The packages a release needs: those it requires and the systems it runs in. Worlds are never needed. */
const needs = ({ relationships: { requires, systems } }: Release): PackageRef[] =>
  [...requires, ...systems].map(relationship => relationship.package).filter(ref => ref.type !== 'world');

/** How a universe is gathered. */
export interface GatherOptions {
  /**
   * Which releases are given, and followed: every one by default. One left out needs nothing, so a package only it
   * needs is not met.
   */
  readonly keep?: (release: Release) => boolean;
  /** Manifest URLs clients gave, by package key, to queue with a package the catalogue does not hold. */
  readonly hints?: ReadonlyMap<string, string>;
}

/**
 * Gathers the universe of some packages: their releases, and those of every package any version of them requires or
 * runs in, all the way down, as `@mondarth/fvtt-resolver` follows them when it loads releases. The packages are read
 * a level at a time, each level in one read of the store. What the catalogue does not hold is queued for the worker.
 *
 * @param store - The catalogue
 * @param roots - The packages asked for
 * @param options - Which releases to give, and the manifest URLs clients gave
 * @returns The universe, and what is missing from it
 */
export async function gatherUniverse(
  store: CatalogueStore,
  roots: readonly PackageRef[],
  { keep = () => true, hints = new Map<string, string>() }: GatherOptions = {},
): Promise<GatheredUniverse> {
  const met = new Map<string, PackageRef>();
  const meet = (refs: readonly PackageRef[]): PackageRef[] =>
    refs.filter(ref => {
      const key = packageKey(ref);
      if (met.has(key)) return false;
      met.set(key, ref);
      return true;
    });

  const releases: Release[] = [];
  const held: PackageRef[] = [];
  const pending: PackageRef[] = [];
  const unavailable: UnavailablePackage[] = [];
  const crawl: CrawlRequest[] = [];
  let asOf: Date | null | undefined;
  let level = meet(roots);
  let reason: CrawlRequest['reason'] = 'request';
  while (level.length > 0) {
    const ofLevel = await store.releasesOfEach(level);
    const next: PackageRef[] = [];
    for (const ref of level) {
      const found = ofLevel.get(packageKey(ref));
      if (found === undefined) {
        pending.push(ref);
        const manifest = hints.get(packageKey(ref));
        crawl.push({ package: ref, reason, ...(manifest !== undefined && { manifest }) });
        continue;
      }
      asOf = older(asOf, found.asOf);
      // It holds no releases, so needs nothing.
      if (found.unavailable !== null) {
        unavailable.push({ package: ref, ...found.unavailable });
        continue;
      }
      held.push(ref);
      const kept = found.releases.filter(release => keep(release));
      releases.push(...kept);
      next.push(...meet(kept.flatMap(needs)));
    }
    level = next;
    reason = 'closure';
  }

  const [core, gaps] = await Promise.all([store.coreReleases(), store.gapsOf([...met.keys()])]);
  if (crawl.length > 0) await store.requestCrawl(crawl);
  return { universe: { core, releases }, held, gaps, pending, unavailable, asOf: asOf ?? null };
}

/** The older of two times, where null, never, is older than any; undefined is none yet. */
function older(first: Date | null | undefined, second: Date | null): Date | null {
  if (first === undefined) return second;
  if (first === null || second === null) return null;
  return second < first ? second : first;
}
