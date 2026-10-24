/**
 * The catalogue's database. Columns are snake_case in PostgreSQL (drizzle.config.ts `casing`).
 *
 * Releases hold what the API gives, normalised by @mondarth/fvtt-resolver's `normaliseManifest`. The manifests they
 * came from are kept too, so that releases can be normalised again, without fetching anything, when the normaliser
 * changes.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import type { Compatibility } from '@mondarth/fvtt-package-catalogue-contract';

export const packageType = pgEnum('package_type', ['module', 'system', 'world']);
export const releaseDetail = pgEnum('release_detail', ['listed', 'loaded']);
export const relationshipKind = pgEnum('relationship_kind', ['requires', 'systems', 'conflicts', 'recommends']);
export const coreChannel = pgEnum('core_channel', ['stable', 'testing', 'development', 'prototype']);
export const gapReason = pgEnum('gap_reason', ['http', 'network', 'budget', 'invalid']);
export const crawlReason = pgEnum('crawl_reason', ['request', 'closure', 'refresh']);

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow();

/** A package the catalogue knows of. */
export const packages = pgTable(
  'packages',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    type: packageType().notNull(),
    packageId: text().notNull(),
    title: text(),
    /** A premium package, as Foundry VTT's listing says. */
    premium: boolean().notNull().default(false),
    /** The listing's `last_updated`: its details change only when this does. */
    listingUpdatedAt: timestamp({ withTimezone: true }),
    /** When its releases were last brought up to date: the API's `asOf`. */
    syncedAt: timestamp({ withTimezone: true }),
    createdAt,
  },
  table => [unique().on(table.type, table.packageId)],
);

/** A manifest as fetched, by the SHA-256 of its body. */
export const rawManifests = pgTable('raw_manifests', {
  hash: text().primaryKey(),
  url: text().notNull(),
  body: jsonb().notNull(),
  fetchedAt: createdAt,
});

/** One version of a package. */
export const releases = pgTable(
  'releases',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    packageRef: integer()
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    version: text().notNull(),
    minimum: text(),
    maximum: text(),
    verified: text(),
    /** The listing's core compatibility for this version, which its author can edit after the release. */
    listing: jsonb().$type<Compatibility>(),
    manifest: text(),
    download: text(),
    versionManifest: text(),
    protected: boolean().notNull().default(false),
    origin: text().notNull(),
    detail: releaseDetail().notNull(),
    unlisted: boolean().notNull().default(false),
    loadFailed: boolean().notNull().default(false),
    /** The source the release was found by, such as `foundry-index`. */
    source: text().notNull(),
    /** The manifest it was loaded from, if it was. */
    manifestHash: text().references(() => rawManifests.hash),
    /** When the release last changed. Set by the store's upsert: Drizzle's `$onUpdate` does not run for one. */
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [unique().on(table.packageRef, table.version)],
);

/** A relationship a release declares, in the order its manifest gives them. */
export const relationships = pgTable(
  'relationships',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    releaseRef: integer()
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    kind: relationshipKind().notNull(),
    position: smallint().notNull(),
    targetType: packageType().notNull(),
    targetId: text().notNull(),
    minimum: text(),
    maximum: text(),
    verified: text(),
    manifest: text(),
    reason: text(),
  },
  table => [
    unique().on(table.releaseRef, table.kind, table.position),
    // What depends on a package: for closures and for refreshing dependants.
    index().on(table.targetType, table.targetId),
  ],
);

/** A build of Foundry VTT. */
export const coreReleases = pgTable('core_releases', {
  version: text().primaryKey(),
  generation: integer().notNull(),
  channel: coreChannel().notNull(),
  createdAt,
});

/** Something a source could not fetch or read, as @mondarth/fvtt-resolver reports it. */
export const sourceGaps = pgTable(
  'source_gaps',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    source: text().notNull(),
    url: text().notNull(),
    reason: gapReason().notNull(),
    status: integer(),
    packageKey: text(),
    version: text(),
    seenAt: createdAt,
  },
  table => [index().on(table.packageKey)],
);

/** A package someone asked for, or that a closure needs, waiting for the worker to fetch it. */
export const crawlRequests = pgTable(
  'crawl_requests',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    type: packageType().notNull(),
    packageId: text().notNull(),
    reason: crawlReason().notNull(),
    requestedAt: createdAt,
  },
  table => [unique().on(table.type, table.packageId)],
);

/** One run of a worker job. */
export const syncRuns = pgTable('sync_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  job: text().notNull(),
  startedAt: createdAt,
  finishedAt: timestamp({ withTimezone: true }),
  requests: integer().notNull().default(0),
  outcome: text({ enum: ['ok', 'failed'] }),
  error: text(),
});
