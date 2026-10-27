/**
 * Refreshing: which packages the catalogue holds are due to be crawled again. Foundry VTT's index says when each
 * package it lists last changed; a package it does not list is crawled again once it is old enough.
 */
import { PackageType, packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { z } from 'zod';

import type { PackageRef, UnavailableReason } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, SourceResult } from '@mondarth/fvtt-resolver/sources';

/** The index is kept for five minutes, as Foundry VTT keeps it, and a stale copy serves for a day. */
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

/** A package the catalogue holds, as far as refreshing it goes. */
export interface HeldPackage {
  readonly ref: PackageRef;
  /** When its releases were last brought up to date. */
  readonly syncedAt: Date | null;
  /** The index's `last_updated` when it was last read, the package's listing details with it. */
  readonly listingUpdatedAt: Date | null;
  readonly title: string | null;
  readonly premium: boolean;
  /** Why it cannot be had, if it cannot. */
  readonly unavailable: UnavailableReason | null;
}

/** A package Foundry VTT's index lists. */
export interface IndexEntry {
  readonly ref: PackageRef;
  /** When the package last changed on the index, to the day; null if the index does not say. */
  readonly lastUpdated: Date | null;
  readonly title: string | null;
  readonly premium: boolean;
  /** Whether its listing is archived, so that Foundry VTT's Setup screen no longer offers it. */
  readonly archived: boolean;
}

/** The index's details of a package, to keep with it. */
export interface Listing {
  readonly ref: PackageRef;
  readonly listingUpdatedAt: Date | null;
  readonly title: string | null;
  readonly premium: boolean;
}

/** What a refresh does. */
export interface RefreshPlan {
  /** The packages to crawl again. */
  readonly refresh: PackageRef[];
  /** The listing details that changed, to save. */
  readonly listings: Listing[];
}

const indexSchema = z.object({
  packages: z.array(
    z.looseObject({
      id: z.string(),
      type: z.string(),
      title: z.string().optional(),
      last_updated: z.string().nullish(),
      premium: z.boolean().optional(),
      status: z.string().optional(),
    }),
  ),
});

/** A day, `2026-05-03`, as the start of it in UTC; null if it is not one. */
function dayOf(text: string | null | undefined): Date | null {
  if (text == null || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const day = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

/**
 * Reads Foundry VTT's index, leaving out entries of no package type the catalogue knows.
 *
 * @param value - The index, as fetched
 * @returns Its packages, or undefined if it is not an index
 */
export function readIndex(value: unknown): IndexEntry[] | undefined {
  const read = indexSchema.safeParse(value);
  if (!read.success) return undefined;
  return read.data.packages.flatMap(entry => {
    const type = PackageType.safeParse(entry.type);
    if (!type.success) return [];
    return [
      {
        ref: { type: type.data, id: entry.id },
        lastUpdated: dayOf(entry.last_updated),
        title: entry.title ?? null,
        premium: entry.premium === true,
        archived: entry.status === 'archived',
      },
    ];
  });
}

/**
 * Fetches Foundry VTT's index, through the client's cache: it is large, and revalidated by its ETag.
 *
 * @param http - The client
 * @param url - Where the index is
 * @returns Its packages, or the gap that stopped them being read
 */
export async function fetchIndex(http: HttpClient, url: string): Promise<SourceResult<IndexEntry[]>> {
  const source = 'foundry-index';
  const fetched = await http.getJson(url, { maxAge: FIVE_MINUTES, staleIfError: ONE_DAY });
  if (!fetched.ok) return { ok: false, gap: { ...fetched.gap, source } };
  const entries = readIndex(fetched.value);
  return entries === undefined ? { ok: false, gap: { source, url, reason: 'invalid' } } : { ok: true, value: entries };
}

/** The start of a time's day, in UTC. */
const startOfDay = (time: Date) => new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate()));

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Plans a refresh.
 *
 * A package on the index is due when the index's `last_updated` is newer than the one read before, or, never read
 * before, when it is not older than the day the package was synced: the index gives only the day, so a change on the
 * day of the sync may be after it. A package not on the index, or whose entry gives no date, is due once it was last
 * synced `staleMs` ago.
 *
 * @param held - The packages held
 * @param index - Foundry VTT's index
 * @param options - The time now, and how old a package not on the index may grow
 * @returns What to crawl again, and what listing details to save
 */
export function planRefresh(
  held: readonly HeldPackage[],
  index: readonly IndexEntry[],
  { now, staleMs }: { readonly now: Date; readonly staleMs: number },
): RefreshPlan {
  const listed = new Map(index.map(entry => [packageKey(entry.ref), entry]));
  const refresh: PackageRef[] = [];
  const listings: Listing[] = [];
  for (const pkg of held) {
    const entry = listed.get(packageKey(pkg.ref));
    const stale = pkg.syncedAt === null || now.getTime() - pkg.syncedAt.getTime() >= staleMs;
    if (entry?.lastUpdated == null) {
      if (stale) refresh.push(pkg.ref);
    } else if (
      pkg.syncedAt === null ||
      (pkg.listingUpdatedAt === null
        ? entry.lastUpdated >= startOfDay(pkg.syncedAt)
        : entry.lastUpdated > pkg.listingUpdatedAt)
    ) {
      refresh.push(pkg.ref);
    } else if (entry.archived ? pkg.unavailable === null : pkg.unavailable === 'archived') {
      // Archived or no longer, without its date changing: a package gone is gone whatever the index says.
      refresh.push(pkg.ref);
    }
    if (
      entry !== undefined &&
      (!sameTime(entry.lastUpdated, pkg.listingUpdatedAt) || entry.title !== pkg.title || entry.premium !== pkg.premium)
    ) {
      listings.push({ ref: pkg.ref, listingUpdatedAt: entry.lastUpdated, title: entry.title, premium: entry.premium });
    }
  }
  return { refresh, listings };
}
