/**
 * The store, in PostgreSQL through Drizzle.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { and, asc, count, eq, inArray, max, or, sql } from 'drizzle-orm';

import { coreReleases, crawlRequests, packages, relationships, releases, sourceGaps } from '../db/schema.js';

import type {
  Compatibility,
  PackageRef,
  Relationship,
  Release,
  SourceGap,
} from '@mondarth/fvtt-package-catalogue-contract';
import type { Database } from '../db/database.js';
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
      .select({ id: packages.id, type: packages.type, packageId: packages.packageId, syncedAt: packages.syncedAt })
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
      return { packages: held.packages, releases: released.releases, asOf: held.asOf };
    },

    async releasesOf(ref) {
      return (await releasesOfEach([ref])).get(packageKey(ref));
    },

    releasesOfEach,

    async saveReleases(ref, given, { source, at }) {
      const stranger = given.find(release => release.package.type !== ref.type || release.package.id !== ref.id);
      if (stranger !== undefined)
        throw new Error(`A release of ${stranger.package.type}:${stranger.package.id} is not of ${ref.type}:${ref.id}`);

      await db.transaction(async tx => {
        const [saved] = await tx
          .insert(packages)
          .values({ type: ref.type, packageId: ref.id, syncedAt: at })
          .onConflictDoUpdate({ target: [packages.type, packages.packageId], set: { syncedAt: at } })
          .returning({ id: packages.id });
        /* v8 ignore next -- an upsert always returns its row */
        if (saved === undefined) throw new Error(`${ref.type}:${ref.id} was not saved`);

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
      await db.insert(sourceGaps).values(
        gaps.map(gap => ({
          source: gap.source,
          url: gap.url,
          reason: gap.reason,
          status: gap.status ?? null,
          packageKey: gap.package ?? null,
          version: gap.version ?? null,
        })),
      );
    },

    async requestCrawl(requests) {
      if (requests.length === 0) return;
      await db
        .insert(crawlRequests)
        .values(requests.map(({ package: ref, reason }) => ({ type: ref.type, packageId: ref.id, reason })))
        .onConflictDoUpdate({
          target: [crawlRequests.type, crawlRequests.packageId],
          // Once asked for, a package stays asked for: the worker fetches those first.
          set: {
            reason: sql`case when excluded.reason = 'request' then excluded.reason else ${crawlRequests.reason} end`,
          },
        });
    },
  };
}
