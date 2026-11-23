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
import type { CatalogueStore, CrawlRequest, PackageReleases } from './store/types.js';

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
  /** The time now, to tell a package held with no releases that is due to be crawled again (see {@link isEmptyDue}). */
  readonly now?: Date;
}

/**
 * How long after a package held with no releases was last crawled a client asking for it has it crawled again, in
 * seconds. One crawled before any client gave the manifest URL it is found by, as a package outside Foundry VTT's
 * listing is, holds nothing until it is crawled again with it; once an hour at most, so that a package that truly has
 * no releases is not crawled at every request.
 */
export const EMPTY_RECRAWL_SECONDS = 3600;

/**
 * Whether a package held is due to be crawled again because a client asks for it: it has no releases, and was last
 * crawled, if ever, more than {@link EMPTY_RECRAWL_SECONDS} ago.
 *
 * @param held - The package's releases held, and when they were last brought up to date
 * @param now - The time now
 * @returns `true` if it is to be crawled again
 */
export function isEmptyDue(held: PackageReleases, now: Date): boolean {
  if (held.releases.length > 0 || held.unavailable !== null) return false;
  return held.asOf === null || now.getTime() - held.asOf.getTime() > EMPTY_RECRAWL_SECONDS * 1000;
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
  { keep = () => true, hints = new Map<string, string>(), now = new Date() }: GatherOptions = {},
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
      // What it holds is as of when it was crawled, even what is to be crawled again.
      if (found !== undefined) asOf = older(asOf, found.asOf);
      // Not held, or held with nothing, so long that it is to be crawled again: pending either way.
      if (found === undefined || isEmptyDue(found, now)) {
        pending.push(ref);
        const manifest = hints.get(packageKey(ref));
        crawl.push({ package: ref, reason, ...(manifest !== undefined && { manifest }) });
        continue;
      }
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
