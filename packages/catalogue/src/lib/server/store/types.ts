/**
 * The store: everything the API and the worker read and write. Routes and services see only this interface, never
 * Drizzle, so that the database can change behind it and tests can stand in for it.
 */
import type { PackageRef, Release } from '@mondarth/fvtt-package-catalogue-contract';

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
   * Records releases of a package, adding the package if it is new. A release of a version already held replaces it,
   * relationships and all; releases not given are kept.
   *
   * @throws {Error} If a release is of another package
   */
  saveReleases(ref: PackageRef, releases: readonly Release[], options: SaveOptions): Promise<void>;
}

/** Where saved releases came from, and when. */
export interface SaveOptions {
  /** The source the releases were found by, such as `foundry-index`. */
  readonly source: string;
  /** When they were fetched: the package's new `asOf`. */
  readonly at: Date;
}
