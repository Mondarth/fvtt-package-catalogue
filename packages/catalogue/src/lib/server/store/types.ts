/**
 * The store: everything the API and the worker read and write. Routes and services see only this interface, never
 * Drizzle, so that the database can change behind it and tests can stand in for it.
 */
import type {
  ConsistencyReport,
  CoreRelease,
  PackageRef,
  Release,
  SourceGap,
  UnavailableReason,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { CheckedPackage, IndexedPackage } from '../consistency.js';
import type { HeldPackage, IndexEntry, Listing, OwnCheck } from '../refresh.js';

/** What the catalogue holds, for the status endpoint. */
export interface CatalogueStatus {
  readonly packages: number;
  readonly releases: number;
  /** When a package's releases were last brought up to date; null if none ever were. */
  readonly asOf: Date | null;
  /** How it last compared with Foundry VTT's index; null if it never has. */
  readonly consistency: ConsistencyReport | null;
}

/** A package's releases, as known when they were last brought up to date. */
export interface PackageReleases {
  readonly releases: readonly Release[];
  readonly asOf: Date | null;
  /** Why the package cannot be had, if it cannot: then it has no releases. */
  readonly unavailable: Unavailable | null;
}

/** Why a package cannot be had. */
export interface Unavailable {
  readonly reason: UnavailableReason;
  /** More of why, in words. */
  readonly note?: string;
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
   * relationships and all; releases not given are kept, but for the versions `options.remove` names, which go.
   *
   * @throws {Error} If a release is of another package
   */
  saveReleases(ref: PackageRef, releases: readonly Release[], options: SaveOptions): Promise<void>;
  /**
   * Records that a package cannot be had, adding the package if it is new, and removing every release held of it. Saving
   * its releases again makes it available.
   */
  saveUnavailable(ref: PackageRef, unavailable: Unavailable, options: SaveOptions): Promise<void>;
  /** Foundry VTT's builds, oldest first. */
  coreReleases(): Promise<CoreRelease[]>;
  /** Records builds of Foundry VTT; a build already held is replaced. */
  saveCoreReleases(core: readonly CoreRelease[]): Promise<void>;
  /** What sources could not fetch or read for these packages, by package key, oldest first. */
  gapsOf(keys: readonly string[]): Promise<SourceGap[]>;
  recordGaps(gaps: readonly SourceGap[]): Promise<void>;
  /**
   * Queues packages for the worker to fetch. A package already queued stays queued once, for the most pressing reason
   * it was ever queued for, in the order of {@link nextCrawl}.
   */
  requestCrawl(requests: readonly CrawlRequest[]): Promise<void>;
  /**
   * Takes the next package the worker may crawl at this time: asked for before needed, needed before due a refresh, due
   * a refresh before warming, oldest first within each. Undefined if none is due. It is held for an hour, so that no
   * other crawl takes it, until it is finished or deferred; one neither, as when the worker stops mid-crawl, is given
   * again once the hour is over.
   *
   * @param options.warm - Whether a package queued to warm may be given; true by default
   */
  nextCrawl(now: Date, options?: { readonly warm?: boolean }): Promise<QueuedCrawl | undefined>;
  /** Takes a crawled package off the queue. */
  finishCrawl(id: number): Promise<void>;
  /** Leaves a package on the queue after a failed crawl, counting the failure, not to be tried before `until`. */
  deferCrawl(id: number, until: Date): Promise<void>;
  /** Replaces what sources could not fetch or read for a package, by its key, with the gaps of its latest crawl. */
  replaceGaps(key: string, gaps: readonly SourceGap[]): Promise<void>;
  /** The manifest URLs that held releases' relationships give for a package, which a crawl may find it by. */
  declaredManifests(ref: PackageRef): Promise<string[]>;
  /** Which of these packages the catalogue does not know, in the order given. */
  unknownOf(refs: readonly PackageRef[]): Promise<PackageRef[]>;
  /** Records that a run of a worker job started, and returns its id. */
  startRun(job: string, at: Date): Promise<number>;
  /** Records how a run of a worker job ended. */
  finishRun(id: number, end: RunEnd): Promise<void>;
  /** When a run of a job last ended well; null if none ever did. */
  lastSuccess(job: string): Promise<Date | null>;
  /** Every package the catalogue holds, with when it was synced and its listing details. */
  heldPackages(): Promise<HeldPackage[]>;
  /**
   * The packages held, and available, whose own manifest was last checked before `before`, or never, the least recently
   * checked first, never checked first of all; at most `limit`.
   */
  ownChecksDue(before: Date, limit: number): Promise<PackageRef[]>;
  /**
   * Records checks of packages' own manifests, made at `at`: a package read keeps the version its manifest gave; one
   * with no manifest of its own keeps none; one whose manifest could not be read keeps what it last gave.
   */
  saveOwnChecks(checks: readonly OwnCheck[], at: Date): Promise<void>;
  /**
   * What the consistency check compares: the catalogue's copy of Foundry VTT's index, delisted entries and worlds left
   * out, and every package held, with its releases' versions and listings.
   */
  consistencyInputs(): Promise<{ indexed: IndexedPackage[]; held: CheckedPackage[] }>;
  /** Keeps a consistency check's report; the latest is the status's. */
  saveConsistency(report: ConsistencyReport): Promise<void>;
  /**
   * The packages Foundry VTT's index lists, and has not archived, that the catalogue does not hold and has not queued,
   * the most recently changed first: those to warm.
   */
  unwarmed(): Promise<PackageRef[]>;
  /** Saves Foundry VTT's index's details of packages held; a package not held is left out. */
  saveListings(listings: readonly Listing[]): Promise<void>;
  /**
   * Keeps the catalogue's copy of Foundry VTT's index, held or not: an entry new or changed is written, one the index
   * lists again is no longer delisted, and one it no longer lists is marked delisted at `at`. An index that lists fewer
   * than half the entries kept delists none, as it is more likely cut short than so many packages gone.
   */
  saveIndex(entries: readonly IndexEntry[], at: Date): Promise<IndexSaved>;
}

/** What saving Foundry VTT's index changed. */
export interface IndexSaved {
  readonly added: number;
  /** Entries that changed, among them those listed again. */
  readonly changed: number;
  readonly delisted: number;
}

/** A package on the worker's queue. */
export interface QueuedCrawl extends CrawlRequest {
  readonly id: number;
  /** How many crawls of it have failed. */
  readonly attempts: number;
}

/** How a run of a worker job ended. */
export interface RunEnd {
  readonly at: Date;
  readonly outcome: 'ok' | 'failed';
  /** How many HTTP requests it made. */
  readonly requests: number;
  readonly error?: string;
}

/** A package for the worker to fetch, and why. */
export interface CrawlRequest {
  readonly package: PackageRef;
  /**
   * `request`: a client asked for it. `closure`: a package asked for needs it. `refresh`: it is due an update. `warm`:
   * the index lists it and no client has needed it yet, so that it is held before one does.
   */
  readonly reason: 'request' | 'closure' | 'refresh' | 'warm';
}

/** Where saved releases came from, and when. */
export interface SaveOptions {
  /** What saved the releases: the worker's `crawl`, or a test's seed. */
  readonly source: string;
  /** When they were fetched: the package's new `asOf`. */
  readonly at: Date;
  /** Versions held to remove, relationships and all, as a crawl finds them gone (see `crawlPackage`). */
  readonly remove?: readonly string[];
}
