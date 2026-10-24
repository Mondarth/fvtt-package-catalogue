/**
 * Crawling a package: finding every release of it that the sources list, and loading each from its manifest, so that
 * the catalogue holds what each release requires and runs in.
 */
import { Release, packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { sourceSet } from '@mondarth/fvtt-resolver/sources';

import type { CoreRelease, PackageRef, SourceGap } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, ReleaseSource } from '@mondarth/fvtt-resolver/sources';

/** What a crawl works with. */
export interface CrawlOptions {
  readonly http: HttpClient;
  /** The sources, in order: where two list the same version, the first is used. */
  readonly sources: readonly ReleaseSource[];
  /** Foundry VTT's builds: releases that none of them could run are left out. None leaves none out. */
  readonly core: readonly CoreRelease[];
  /** The releases of the package held already. One already loaded is kept, not loaded again. */
  readonly held: readonly Release[];
  /** Manifest URLs declared for the package, by the relationships of releases that need it. */
  readonly manifests: readonly string[];
}

/** What a crawl found. */
export interface Crawled {
  /** Every release found, each loaded unless its manifest could not be read, as the API gives them. */
  readonly releases: Release[];
  /** What the sources could not fetch or read for the package, and the releases the contract would not accept. */
  readonly gaps: SourceGap[];
  /** The packages its releases require or run in, each once: the closure that the catalogue builds out to. */
  readonly named: PackageRef[];
}

/** The source of the gap for a release the contract will not accept. */
const CONTRACT = 'contract';

/**
 * Crawls a package.
 *
 * @param ref - The package
 * @param options - The sources, and what the catalogue holds already
 * @returns What was found
 */
export async function crawlPackage(ref: PackageRef, options: CrawlOptions): Promise<Crawled> {
  const key = packageKey(ref);
  const set = sourceSet({
    sources: options.sources,
    http: options.http,
    core: options.core,
    manifests: { [key]: options.manifests },
  });
  const ofPackage = (release: { readonly package: PackageRef }) => packageKey(release.package) === key;

  const { releases: listed } = await set.universe([ref]);
  const held = new Map(options.held.filter(release => release.detail === 'loaded').map(r => [r.version, r]));
  // A listing can change a release's core compatibility after it is released; its manifest cannot.
  const reused = (release: (typeof listed)[number]) => {
    const kept = held.get(release.version);
    return kept && { ...kept, ...(release.listing !== undefined && { listing: release.listing }) };
  };
  const toLoad = listed.filter(
    release => release.detail === 'listed' && release.loadFailed !== true && reused(release) === undefined,
  );
  const loaded = new Map((await set.load(toLoad)).filter(ofPackage).map(release => [release.version, release]));

  const gaps: SourceGap[] = set
    .gaps()
    // A gap of no package, such as the index being unreachable, is this package's; loading lists the packages its
    // releases name, whose gaps are theirs, for their own crawls.
    .map(gap => ({ ...gap, package: gap.package ?? key }))
    .filter(gap => gap.package === key);
  const releases: Release[] = [];
  for (const release of listed) {
    const found =
      reused(release) ??
      loaded.get(release.version) ??
      (toLoad.includes(release) ? { ...release, loadFailed: true } : release);
    const read = Release.safeParse(found);
    if (read.success) releases.push(read.data);
    else
      gaps.push({ source: CONTRACT, url: release.origin, reason: 'invalid', package: key, version: release.version });
  }
  return { releases, gaps, named: namedBy(ref, releases) };
}

/** The packages some releases require or run in, each once, leaving out the package itself and worlds. */
function namedBy(ref: PackageRef, releases: readonly Release[]): PackageRef[] {
  const named = new Map<string, PackageRef>();
  for (const { relationships } of releases) {
    for (const { package: other } of [...relationships.requires, ...relationships.systems]) {
      const key = packageKey(other);
      if (other.type !== 'world' && key !== packageKey(ref) && !named.has(key)) named.set(key, other);
    }
  }
  return [...named.values()];
}
