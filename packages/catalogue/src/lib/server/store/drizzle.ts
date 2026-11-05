/**
 * The store, in PostgreSQL through Drizzle.
 */
import { createHash } from 'node:crypto';

import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  notExists,
  or,
  sql,
} from 'drizzle-orm';

import {
  consistencyReports,
  coreReleases,
  crawlRequests,
  listings,
  packages,
  relationships,
  releases,
  sourceGaps,
  syncRuns,
} from '../db/schema.js';

import type {
  Compatibility,
  PackageRef,
  Relationship,
  Release,
  SourceGap,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import type { IndexEntry } from '../refresh.js';
import type { CatalogueStore, PackageReleases } from './types.js';

type ReleaseRow = typeof releases.$inferSelect;
type GapRow = typeof sourceGaps.$inferSelect;
type RelationshipRow = typeof relationships.$inferSelect;
type Kind = RelationshipRow['kind'];

const KINDS: readonly Kind[] = ['requires', 'systems', 'conflicts', 'recommends'];

/** A compatibility block from nullable columns, leaving out what is null. */
function compatibilityOf(row: {
  minimum: string | null;
  maximum: string | null;
  verified: string | null;
}): Compatibility {
  return {
    ...(row.minimum !== null && { minimum: row.minimum }),
    ...(row.maximum !== null && { maximum: row.maximum }),
    ...(row.verified !== null && { verified: row.verified }),
  };
}

/** Nullable columns from a compatibility block. */
const columnsOf = ({ minimum, maximum, verified }: Compatibility) => ({
  minimum: minimum ?? null,
  maximum: maximum ?? null,
  verified: verified ?? null,
});

function relationshipOf(row: RelationshipRow): Relationship {
  return {
    package: { type: row.targetType, id: row.targetId },
    compatibility: compatibilityOf(row),
    ...(row.manifest !== null && { manifest: row.manifest }),
    ...(row.reason !== null && { reason: row.reason }),
  };
}

function releaseOf(ref: PackageRef, row: ReleaseRow, related: readonly RelationshipRow[]): Release {
  const of = (kind: Kind) =>
    related
      .filter(relationship => relationship.kind === kind)
      .toSorted((a, b) => a.position - b.position)
      .map(relationshipOf);
  return {
    package: { type: ref.type, id: ref.id },
    version: row.version,
    compatibility: compatibilityOf(row),
    relationships: {
      requires: of('requires'),
      systems: of('systems'),
      conflicts: of('conflicts'),
      recommends: of('recommends'),
    },
    ...(row.manifest !== null && { manifest: row.manifest }),
    ...(row.download !== null && { download: row.download }),
    ...(row.versionManifest !== null && { versionManifest: row.versionManifest }),
    protected: row.protected,
    origin: row.origin,
    detail: row.detail,
    ...(row.listing !== null && { listing: row.listing }),
    ...(row.unlisted && { unlisted: true }),
    ...(row.loadFailed && { loadFailed: true }),
  };
}

/** A gap as a row, for a package or for the package of its own. */
const gapRow = (gap: SourceGap) => ({
  source: gap.source,
  url: gap.url,
  reason: gap.reason,
  status: gap.status ?? null,
  packageKey: gap.package ?? null,
  version: gap.version ?? null,
});

/** How long a package taken to crawl is held from other crawls, unless it is finished or deferred first. */
const CRAWL_HOLD_MS = 60 * 60 * 1000;

/** How many index entries are written in one statement. */
const INDEX_BATCH = 500;

/** An index entry as a row of `listings`, with the hash of what the index gave. */
function listingRow({ ref, lastUpdated, title, premium, details }: IndexEntry) {
  const row = {
    type: ref.type,
    packageId: ref.id,
    title,
    summary: details.summary,
    authorName: details.author?.name ?? null,
    authorUsername: details.author?.username ?? null,
    providerId: details.provider?.id ?? null,
    providerName: details.provider?.name ?? null,
    url: details.url,
    marketplaceUrl: details.marketplaceUrl,
    tags: [...details.tags],
    systems: [...details.systems],
    premium,
    exclusive: details.exclusive,
    status: details.status,
    lastUpdated,
    latestVersion: details.latestVersion,
    versions: [...details.versions],
  };
  return { ...row, hash: createHash('sha256').update(JSON.stringify(row)).digest('hex') };
}

/**
 * How pressing a reason to crawl is, the most pressing least: what was asked for, then what closures need, then
 * refreshes, then warming.
 */
const priorityOf = (reason: SQL | typeof crawlRequests.reason) =>
  sql`case ${reason} when 'request' then 0 when 'closure' then 1 when 'refresh' then 2 else 3 end`;

const CRAWL_PRIORITY = priorityOf(crawlRequests.reason);

function gapOf(row: GapRow): SourceGap {
  return {
    source: row.source,
    url: row.url,
    reason: row.reason,
    ...(row.status !== null && { status: row.status }),
    ...(row.packageKey !== null && { package: row.packageKey }),
    ...(row.version !== null && { version: row.version }),
  };
}

/**
 * The store over a Drizzle database.
 *
 * @param db - The database, migrated
 * @returns The store
 */
export function drizzleStore(db: Database): CatalogueStore {
  async function releasesOfEach(refs: readonly PackageRef[]): Promise<Map<string, PackageReleases>> {
    const found = new Map<string, PackageReleases>();
    if (refs.length === 0) return found;
    const held = await db
      .select({
        id: packages.id,
        type: packages.type,
        packageId: packages.packageId,
        syncedAt: packages.syncedAt,
        unavailable: packages.unavailable,
        unavailableNote: packages.unavailableNote,
      })
      .from(packages)
      .where(or(...refs.map(ref => and(eq(packages.type, ref.type), eq(packages.packageId, ref.id)))));
    const ids = held.map(row => row.id);
    const rows =
      ids.length === 0
        ? []
        : await db.select().from(releases).where(inArray(releases.packageRef, ids)).orderBy(asc(releases.id));
    const related =
      rows.length === 0
        ? []
        : await db
            .select()
            .from(relationships)
            .where(
              inArray(
                relationships.releaseRef,
                rows.map(row => row.id),
              ),
            );
    const byKey = new Map(held.map(row => [packageKey({ type: row.type, id: row.packageId }), row]));
    const rowsOf = Map.groupBy(rows, row => row.packageRef);
    const relatedTo = Map.groupBy(related, relationship => relationship.releaseRef);
    for (const ref of refs) {
      const key = packageKey(ref);
      const pkg = byKey.get(key);
      if (pkg === undefined || found.has(key)) continue;
      found.set(key, {
        releases: (rowsOf.get(pkg.id) ?? []).map(row => releaseOf(ref, row, relatedTo.get(row.id) ?? [])),
        asOf: pkg.syncedAt,
        unavailable:
          pkg.unavailable === null
            ? null
            : { reason: pkg.unavailable, ...(pkg.unavailableNote !== null && { note: pkg.unavailableNote }) },
      });
    }
    return found;
  }

  return {
    async ping() {
      await db.execute(sql`select 1`);
    },

    async status() {
      const [held] = await db.select({ packages: count(), asOf: max(packages.syncedAt) }).from(packages);
      const [released] = await db.select({ releases: count() }).from(releases);
      /* v8 ignore next -- an aggregate without GROUP BY always gives one row */
      if (held === undefined || released === undefined) throw new Error('The status could not be counted');
      const [latest] = await db
        .select()
        .from(consistencyReports)
        .orderBy(desc(consistencyReports.at), desc(consistencyReports.id))
        .limit(1);
      return {
        packages: held.packages,
        releases: released.releases,
        asOf: held.asOf,
        consistency: latest === undefined ? null : { at: latest.at.toISOString(), ...latest.report },
      };
    },

    async releasesOf(ref) {
      return (await releasesOfEach([ref])).get(packageKey(ref));
    },

    releasesOfEach,

    async saveReleases(ref, given, { source, at, remove = [] }) {
      const stranger = given.find(release => release.package.type !== ref.type || release.package.id !== ref.id);
      if (stranger !== undefined)
        throw new Error(`A release of ${stranger.package.type}:${stranger.package.id} is not of ${ref.type}:${ref.id}`);

      await db.transaction(async tx => {
        const [saved] = await tx
          .insert(packages)
          .values({ type: ref.type, packageId: ref.id, syncedAt: at })
          // Releases found make the package available, if it was not.
          .onConflictDoUpdate({
            target: [packages.type, packages.packageId],
            set: { syncedAt: at, unavailable: null, unavailableNote: null },
          })
          .returning({ id: packages.id });
        /* v8 ignore next -- an upsert always returns its row */
        if (saved === undefined) throw new Error(`${ref.type}:${ref.id} was not saved`);

        // Their relationships go with them.
        if (remove.length > 0)
          await tx
            .delete(releases)
            .where(and(eq(releases.packageRef, saved.id), inArray(releases.version, [...remove])));

        for (const release of given) {
          const values = {
            packageRef: saved.id,
            version: release.version,
            ...columnsOf(release.compatibility),
            listing: release.listing ?? null,
            manifest: release.manifest ?? null,
            download: release.download ?? null,
            versionManifest: release.versionManifest ?? null,
            protected: release.protected,
            origin: release.origin,
            detail: release.detail,
            unlisted: release.unlisted ?? false,
            loadFailed: release.loadFailed ?? false,
            source,
            updatedAt: sql`now()`,
          };
          const [row] = await tx
            .insert(releases)
            .values(values)
            .onConflictDoUpdate({ target: [releases.packageRef, releases.version], set: values })
            .returning({ id: releases.id });
          /* v8 ignore next -- an upsert always returns its row */
          if (row === undefined) throw new Error(`${ref.type}:${ref.id} ${release.version} was not saved`);

          await tx.delete(relationships).where(eq(relationships.releaseRef, row.id));
          const related = KINDS.flatMap(kind =>
            release.relationships[kind].map((relationship, position) => ({
              releaseRef: row.id,
              kind,
              position,
              targetType: relationship.package.type,
              targetId: relationship.package.id,
              ...columnsOf(relationship.compatibility),
              manifest: relationship.manifest ?? null,
              reason: relationship.reason ?? null,
            })),
          );
          if (related.length > 0) await tx.insert(relationships).values(related);
        }
      });
    },

    async saveUnavailable(ref, { reason, note }, { at }) {
      await db.transaction(async tx => {
        const marked = { syncedAt: at, unavailable: reason, unavailableNote: note ?? null };
        const [saved] = await tx
          .insert(packages)
          .values({ type: ref.type, packageId: ref.id, ...marked })
          .onConflictDoUpdate({ target: [packages.type, packages.packageId], set: marked })
          .returning({ id: packages.id });
        /* v8 ignore next -- an upsert always returns its row */
        if (saved === undefined) throw new Error(`${ref.type}:${ref.id} was not saved`);
        // Their relationships go with them.
        await tx.delete(releases).where(eq(releases.packageRef, saved.id));
      });
    },

    async coreReleases() {
      return db
        .select({ version: coreReleases.version, generation: coreReleases.generation, channel: coreReleases.channel })
        .from(coreReleases)
        .orderBy(asc(coreReleases.generation), asc(sql`split_part(${coreReleases.version}, '.', 2)::integer`));
    },

    async saveCoreReleases(core) {
      if (core.length === 0) return;
      await db
        .insert(coreReleases)
        .values([...core])
        .onConflictDoUpdate({
          target: coreReleases.version,
          set: { generation: sql`excluded.generation`, channel: sql`excluded.channel` },
        });
    },

    async gapsOf(keys) {
      if (keys.length === 0) return [];
      const rows = await db
        .select()
        .from(sourceGaps)
        .where(inArray(sourceGaps.packageKey, [...keys]))
        .orderBy(asc(sourceGaps.id));
      return rows.map(gapOf);
    },

    async recordGaps(gaps) {
      if (gaps.length === 0) return;
      await db.insert(sourceGaps).values(gaps.map(gapRow));
    },

    async requestCrawl(requests) {
      if (requests.length === 0) return;
      await db
        .insert(crawlRequests)
        .values(requests.map(({ package: ref, reason }) => ({ type: ref.type, packageId: ref.id, reason })))
        .onConflictDoUpdate({
          target: [crawlRequests.type, crawlRequests.packageId],
          // A package keeps the most pressing reason it was queued for: once asked for, it stays asked for, and one
          // queued to warm that a closure needs is needed.
          set: {
            reason: sql`case when ${priorityOf(sql`excluded.reason`)} < ${CRAWL_PRIORITY} then excluded.reason else ${crawlRequests.reason} end`,
          },
        });
    },

    async nextCrawl(now, { warm = true } = {}) {
      return db.transaction(async tx => {
        // Locked, and one locked already passed over, so that two workers never take one package.
        const [row] = await tx
          .select()
          .from(crawlRequests)
          .where(and(lte(crawlRequests.notBefore, now), warm ? undefined : ne(crawlRequests.reason, 'warm')))
          .orderBy(CRAWL_PRIORITY, asc(crawlRequests.id))
          .limit(1)
          .for('update', { skipLocked: true });
        if (row === undefined) return undefined;
        await tx
          .update(crawlRequests)
          .set({ notBefore: new Date(now.getTime() + CRAWL_HOLD_MS) })
          .where(eq(crawlRequests.id, row.id));
        return {
          id: row.id,
          package: { type: row.type, id: row.packageId },
          reason: row.reason,
          attempts: row.attempts,
        };
      });
    },

    async finishCrawl(id) {
      await db.delete(crawlRequests).where(eq(crawlRequests.id, id));
    },

    async deferCrawl(id, until) {
      await db
        .update(crawlRequests)
        .set({ attempts: sql`${crawlRequests.attempts} + 1`, notBefore: until })
        .where(eq(crawlRequests.id, id));
    },

    async replaceGaps(key, gaps) {
      await db.transaction(async tx => {
        await tx.delete(sourceGaps).where(eq(sourceGaps.packageKey, key));
        if (gaps.length > 0) await tx.insert(sourceGaps).values(gaps.map(gap => ({ ...gapRow(gap), packageKey: key })));
      });
    },

    async declaredManifests(ref) {
      const rows = await db
        // Not null: the query leaves out relationships that declare no manifest.
        .selectDistinct({ manifest: sql<string>`${relationships.manifest}` })
        .from(relationships)
        .where(
          and(
            eq(relationships.targetType, ref.type),
            eq(relationships.targetId, ref.id),
            isNotNull(relationships.manifest),
          ),
        )
        .orderBy(asc(relationships.manifest));
      return rows.map(row => row.manifest);
    },

    async unknownOf(refs) {
      if (refs.length === 0) return [];
      const held = await db
        .select({ type: packages.type, packageId: packages.packageId })
        .from(packages)
        .where(or(...refs.map(ref => and(eq(packages.type, ref.type), eq(packages.packageId, ref.id)))));
      const known = new Set(held.map(row => packageKey({ type: row.type, id: row.packageId })));
      return refs.filter(ref => !known.has(packageKey(ref)));
    },

    async startRun(job, at) {
      const [row] = await db.insert(syncRuns).values({ job, startedAt: at }).returning({ id: syncRuns.id });
      /* v8 ignore next -- an insert always returns its row */
      if (row === undefined) throw new Error(`The run of ${job} was not recorded`);
      return row.id;
    },

    async finishRun(id, { at, outcome, requests, error }) {
      await db
        .update(syncRuns)
        .set({ finishedAt: at, outcome, requests, error: error ?? null })
        .where(eq(syncRuns.id, id));
    },

    async lastSuccess(job) {
      const [row] = await db
        .select({ finishedAt: syncRuns.finishedAt })
        .from(syncRuns)
        .where(and(eq(syncRuns.job, job), eq(syncRuns.outcome, 'ok')))
        .orderBy(desc(syncRuns.finishedAt))
        .limit(1);
      return row?.finishedAt ?? null;
    },

    async heldPackages() {
      const rows = await db
        .select({
          type: packages.type,
          packageId: packages.packageId,
          syncedAt: packages.syncedAt,
          listingUpdatedAt: packages.listingUpdatedAt,
          title: packages.title,
          premium: packages.premium,
          unavailable: packages.unavailable,
        })
        .from(packages)
        .orderBy(asc(packages.id));
      return rows.map(({ type, packageId, ...rest }) => ({ ref: { type, id: packageId }, ...rest }));
    },

    async ownChecksDue(before, limit) {
      const rows = await db
        .select({ type: packages.type, packageId: packages.packageId })
        .from(packages)
        .where(and(isNull(packages.unavailable), or(isNull(packages.ownCheckedAt), lt(packages.ownCheckedAt, before))))
        .orderBy(sql`${packages.ownCheckedAt} asc nulls first`, asc(packages.id))
        .limit(limit);
      return rows.map(({ type, packageId }) => ({ type, id: packageId }));
    },

    async saveOwnChecks(checks, at) {
      if (checks.length === 0) return;
      await db.transaction(async tx => {
        for (const check of checks) {
          // One that failed keeps what was last read.
          const found =
            check.outcome === 'read'
              ? { ownVersion: check.version, ownReadAt: at }
              : check.outcome === 'none' && { ownVersion: null, ownReadAt: null };
          await tx
            .update(packages)
            .set({ ownCheckedAt: at, ...found })
            .where(and(eq(packages.type, check.ref.type), eq(packages.packageId, check.ref.id)));
        }
      });
    },

    async consistencyInputs() {
      const indexed = await db
        .select({
          type: listings.type,
          packageId: listings.packageId,
          status: listings.status,
          latestVersion: listings.latestVersion,
          versions: listings.versions,
        })
        .from(listings)
        .where(and(isNull(listings.delistedAt), ne(listings.type, 'world')))
        .orderBy(asc(listings.id));
      const held = await db
        .select({
          id: packages.id,
          type: packages.type,
          packageId: packages.packageId,
          unavailable: packages.unavailable,
          ownVersion: packages.ownVersion,
        })
        .from(packages)
        .orderBy(asc(packages.id));
      const versions = await db
        .select({ packageRef: releases.packageRef, version: releases.version, listing: releases.listing })
        .from(releases)
        .orderBy(asc(releases.id));
      const releasesOf = Map.groupBy(versions, row => row.packageRef);
      return {
        indexed: indexed.map(row => ({
          ref: { type: row.type, id: row.packageId },
          archived: row.status === 'archived',
          latestVersion: row.latestVersion,
          versions: row.versions,
        })),
        held: held.map(row => ({
          ref: { type: row.type, id: row.packageId },
          unavailable: row.unavailable,
          ownVersion: row.ownVersion,
          releases: (releasesOf.get(row.id) ?? []).map(({ version, listing }) => ({
            version,
            ...(listing !== null && { listing }),
          })),
        })),
      };
    },

    async saveConsistency({ at, ...report }) {
      await db.insert(consistencyReports).values({ at: new Date(at), report });
    },

    async unwarmed() {
      const rows = await db
        .select({ type: listings.type, packageId: listings.packageId })
        .from(listings)
        .where(
          and(
            isNull(listings.delistedAt),
            or(isNull(listings.status), ne(listings.status, 'archived')),
            ne(listings.type, 'world'),
            notExists(
              db
                .select({ id: packages.id })
                .from(packages)
                .where(and(eq(packages.type, listings.type), eq(packages.packageId, listings.packageId))),
            ),
            notExists(
              db
                .select({ id: crawlRequests.id })
                .from(crawlRequests)
                .where(and(eq(crawlRequests.type, listings.type), eq(crawlRequests.packageId, listings.packageId))),
            ),
          ),
        )
        .orderBy(sql`${listings.lastUpdated} desc nulls last`, asc(listings.id));
      return rows.map(({ type, packageId }) => ({ type, id: packageId }));
    },

    async saveListings(given) {
      if (given.length === 0) return;
      await db.transaction(async tx => {
        for (const { ref, listingUpdatedAt, title, premium } of given) {
          await tx
            .update(packages)
            .set({ listingUpdatedAt, title, premium })
            .where(and(eq(packages.type, ref.type), eq(packages.packageId, ref.id)));
        }
      });
    },

    async saveIndex(entries, at) {
      const kept = await db
        .select({
          id: listings.id,
          type: listings.type,
          packageId: listings.packageId,
          hash: listings.hash,
          delistedAt: listings.delistedAt,
        })
        .from(listings);
      const byKey = new Map(kept.map(row => [packageKey({ type: row.type, id: row.packageId }), row]));
      const rows = new Map(entries.map(entry => [packageKey(entry.ref), listingRow(entry)]));
      const added = [...rows].filter(([key]) => !byKey.has(key)).map(([, row]) => ({ ...row, updatedAt: at }));
      const changed = [...rows].flatMap(([key, row]) => {
        const held = byKey.get(key);
        return held !== undefined && (held.hash !== row.hash || held.delistedAt !== null) ? [{ id: held.id, row }] : [];
      });
      const listed = kept.filter(row => row.delistedAt === null);
      const gone =
        rows.size * 2 < listed.length
          ? []
          : listed.filter(row => !rows.has(packageKey({ type: row.type, id: row.packageId }))).map(row => row.id);
      await db.transaction(async tx => {
        for (let start = 0; start < added.length; start += INDEX_BATCH) {
          await tx.insert(listings).values(added.slice(start, start + INDEX_BATCH));
        }
        for (const { id, row } of changed) {
          await tx
            .update(listings)
            .set({ ...row, delistedAt: null, updatedAt: at })
            .where(eq(listings.id, id));
        }
        for (let start = 0; start < gone.length; start += INDEX_BATCH) {
          await tx
            .update(listings)
            .set({ delistedAt: at, updatedAt: at })
            .where(and(inArray(listings.id, gone.slice(start, start + INDEX_BATCH)), isNull(listings.delistedAt)));
        }
      });
      return { added: added.length, changed: changed.length, delisted: gone.length };
    },
  };
}
