/**
 * Releases: one version of a package, with what its manifest declares. The shape is the one
 * `@mondarth/fvtt-resolver` reads as a `Release`, so the API's answers go to it unchanged.
 */
import { z } from 'zod';

import { PackageRef } from './package.js';

/** A version as a manifest or listing gives it; never empty. */
export const Version = z.string().min(1).max(128);

/** A manifest's `compatibility` block, with its versions as strings. */
export const Compatibility = z.object({
  minimum: Version.exactOptional(),
  maximum: Version.exactOptional(),
  verified: Version.exactOptional(),
});
export type Compatibility = z.infer<typeof Compatibility>;

/** A relationship a release declares with another package. */
export const Relationship = z.object({
  package: PackageRef,
  /** The versions of the related package the relationship admits, as declared. */
  compatibility: Compatibility,
  /** Where the related package's manifest is, if the relationship says. */
  manifest: z.url().exactOptional(),
  reason: z.string().exactOptional(),
});
export type Relationship = z.infer<typeof Relationship>;

/** A manifest's `relationships`, each list empty when it declares none. */
export const Relationships = z.object({
  requires: z.array(Relationship),
  /** The systems the release runs in; empty for any system. */
  systems: z.array(Relationship),
  conflicts: z.array(Relationship),
  recommends: z.array(Relationship),
});
export type Relationships = z.infer<typeof Relationships>;

/** How much is known of a release: `loaded` from its manifest, or only `listed` by a listing. */
export const ReleaseDetail = z.enum(['listed', 'loaded']);
export type ReleaseDetail = z.infer<typeof ReleaseDetail>;

/** One version of a package, normalised from its manifest. */
export const Release = z.object({
  package: PackageRef,
  version: Version,
  /** The core versions it declares it works with. */
  compatibility: Compatibility,
  relationships: Relationships,
  /** The manifest URL the release gives, often one that gives the newest release. */
  manifest: z.url().exactOptional(),
  download: z.url().exactOptional(),
  /** A manifest URL for this version alone, which keeps giving it when newer versions are released. */
  versionManifest: z.url().exactOptional(),
  /** A premium package: downloading it needs the user's licence. */
  protected: z.boolean(),
  /** Where the manifest was read from. */
  origin: z.string().min(1),
  detail: ReleaseDetail,
  /** The core `minimum` and `verified` a listing gives for this version, which its author can edit. */
  listing: Compatibility.exactOptional(),
  /** A release the package's listing does not offer. */
  unlisted: z.boolean().exactOptional(),
  /** A listed release whose manifest could not be loaded. */
  loadFailed: z.boolean().exactOptional(),
});
export type Release = z.infer<typeof Release>;
