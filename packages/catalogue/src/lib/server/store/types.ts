/**
 * The store: everything the API and the worker read and write. Routes and services see only this interface, never
 * Drizzle, so that the database can change behind it and tests can stand in for it.
 */
import type { CoreRelease, PackageRef, Release, SourceGap } from '@mondarth/fvtt-package-catalogue-contract';

/** What the catalogue holds, for the status endpoint. */
export interface CatalogueStatus {
  readonly packages: number;
  readonly releases: number;
  /** When a package's releases were last brought up to date; null if none ever were. */
  readonly asOf: Date | null;
}

/** A package's releases, as known when they were last brought up to date. */
export interface PackageReleases {
  readonly releases: readonly Release[];
  readonly asOf: Date | null;
}

/** The catalogue's data. */
export interface CatalogueStore {
  /** Resolves once the database answers. */
  ping(): Promise<void>;
  status(): Promise<CatalogueStatus>;
  /** A package's releases, oldest first as stored; undefined if the catalogue does not know the package. */
  releasesOf(ref: PackageRef): Promise<PackageReleases | undefined>;
  /**
   * The releases of each package the catalogue knows, by package key (`<type>:<id>`), in the order asked. A package it
   * does not know is left out.
   */
  releasesOfEach(refs: readonly PackageRef[]): Promise<ReadonlyMap<string, PackageReleases>>;
  /**
   * Records releases of a package, adding the package if it is new. A release of a version already held replaces it,
   * relationships and all; releases not given are kept.
   *
   * @throws {Error} If a release is of another package
   */
  saveReleases(ref: PackageRef, releases: readonly Release[], options: SaveOptions): Promise<void>;
  /** Foundry VTT's builds, oldest first. */
  coreReleases(): Promise<CoreRelease[]>;
  /** Records builds of Foundry VTT; a build already held is replaced. */
  saveCoreReleases(core: readonly CoreRelease[]): Promise<void>;
  /** What sources could not fetch or read for these packages, by package key, oldest first. */
  gapsOf(keys: readonly string[]): Promise<SourceGap[]>;
  recordGaps(gaps: readonly SourceGap[]): Promise<void>;
  /**
   * Queues packages for the worker to fetch. A package already queued stays queued once, as `request` if it was ever
   * asked for.
   */
  requestCrawl(requests: readonly CrawlRequest[]): Promise<void>;
}

/** A package for the worker to fetch, and why. */
export interface CrawlRequest {
  readonly package: PackageRef;
  /** `request`: a client asked for it. `closure`: a package asked for needs it. `refresh`: it is due an update. */
  readonly reason: 'request' | 'closure' | 'refresh';
}

/** Where saved releases came from, and when. */
export interface SaveOptions {
  /** The source the releases were found by, such as `foundry-index`. */
  readonly source: string;
  /** When they were fetched: the package's new `asOf`. */
  readonly at: Date;
}
