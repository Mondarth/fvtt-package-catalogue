/**
 * Refreshing: which packages the catalogue holds are due to be crawled again. Foundry VTT's index says when each
 * package it lists last changed; a package it does not list is crawled again once it is old enough.
 */
import { PackageType, packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { namesVersion, sameVersion } from '@mondarth/fvtt-resolver';
import { z } from 'zod';

import type { PackageRef, Release, UnavailableReason } from '@mondarth/fvtt-package-catalogue-contract';
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
  /** When the package last changed on the index; null if the index does not say. */
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

/** A time with its offset, `2026-11-02T12:04:25Z`, as the index gives `last_updated` now. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * When the index says a package last changed: a time, as it gives it now, or a day, `2026-05-03`, as it once gave it,
 * as the start of that day in UTC.
 *
 * @param text - The index's `last_updated`
 * @returns The time, or null if it is neither
 */
function timeOf(text: string | null | undefined): Date | null {
  if (text == null) return null;
  let read: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) read = `${text}T00:00:00.000Z`;
  else if (TIMESTAMP.test(text)) read = text;
  else return null;
  const time = new Date(read);
  return Number.isNaN(time.getTime()) ? null : time;
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
        lastUpdated: timeOf(entry.last_updated),
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
 * before, when it is not older than the day the package was synced: an index that gives only the day, as it once did,
 * may give a change on the day of the sync that was after it. Every package is due once it was last synced `staleMs` ago, on the index or not,
 * as a package's own manifest can give a version the index does not, and leave its date as it was.
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
      // Never synced, a package is stale.
      stale ||
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

/**
 * Whether a package's own manifest is to be checked this hour: each package's once a day, a 24th of them each hour, by
 * its key, so that the requests are spread through the day.
 *
 * @param ref - The package
 * @param now - The time now
 * @returns Whether it is due
 */
export function manifestCheckDue(ref: PackageRef, now: Date): boolean {
  let hash = 0;
  for (const char of packageKey(ref)) hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  return hash % 24 === now.getUTCHours();
}

/**
 * The manifest a package's releases say is its own, as Foundry VTT's updater reads it to update the package: that of
 * its newest listed release, or, if none is listed, of its newest. One that names that release's version is that
 * release's alone, and never gives a newer one, so it is none: reading it again would only load what is held.
 *
 * @param releases - Its releases held, oldest first as stored
 * @returns The manifest's URL, if the release gives one that may give a newer version
 */
export function ownManifest(releases: readonly Release[]): string | undefined {
  const withManifest = releases.filter(release => release.manifest !== undefined);
  const listed = withManifest.filter(release => release.unlisted !== true);
  const newest = listed.at(-1) ?? withManifest.at(-1);
  return newest?.manifest === undefined || namesVersion(newest.manifest, newest.version) ? undefined : newest.manifest;
}

/**
 * The packages whose own manifest gives a version the catalogue does not hold, as one its author published by the
 * manifest alone, so that Foundry VTT's index, and its date, are as they were. Each manifest is asked through the
 * client's cache; one that cannot be read, or gives no version, changes nothing.
 *
 * @param http - The client
 * @param held - The packages to check, each with its releases held
 * @returns Those to crawl again
 */
export async function manifestChanges(
  http: HttpClient,
  held: readonly { readonly ref: PackageRef; readonly releases: readonly Release[] }[],
): Promise<PackageRef[]> {
  const changed: PackageRef[] = [];
  for (const { ref, releases } of held) {
    const url = ownManifest(releases);
    if (url === undefined) continue;
    const fetched = await http.getJson(url, { maxAge: FIVE_MINUTES });
    const version = fetched.ok ? (fetched.value as { readonly version?: unknown } | null)?.version : undefined;
    if (typeof version !== 'string' && typeof version !== 'number') continue;
    if (!releases.some(release => sameVersion(release.version, String(version)))) changed.push(ref);
  }
  return changed;
}
