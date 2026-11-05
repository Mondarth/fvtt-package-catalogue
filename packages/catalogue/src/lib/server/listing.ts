/**
 * Foundry VTT's listing, as the catalogue keeps it: every package it offers to install, for a client such as EMMA's
 * Install sections, which read it from here rather than from Foundry VTT. The same for every client, so the answer is
 * made once for each version of the listing, and given with an ETag.
 */
import { CoreResponse, ListedPackage, ListingResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { createHash } from 'node:crypto';

import type { CatalogueStore, ListedEntry, ListingType } from './store/types.js';

/** How long a client may keep the listing without asking again, in seconds: the index changes about hourly. */
export const LISTING_MAX_AGE = 300;

/** How long a client may keep Foundry VTT's builds without asking again, in seconds: they change a few times a month. */
export const CORE_MAX_AGE = 3600;

/** The listing's entries as the contract gives them; one that breaks it, as an entry the index gives oddly, is left out. */
function listedPackages(entries: readonly ListedEntry[]): ListedPackage[] {
  return entries.flatMap(entry => {
    const read = ListedPackage.safeParse({
      package: entry.ref,
      title: entry.title ?? entry.ref.id,
      summary: entry.summary,
      author: entry.author,
      url: entry.url,
      tags: entry.tags,
      systems: entry.systems,
      premium: entry.premium,
      exclusive: entry.exclusive,
      latest: entry.latest,
      versions: entry.versions,
    });
    return read.success ? [read.data] : [];
  });
}

/** The listing's answers made, by ETag: one for each type asked for, kept until the listing changes. */
const made = new Map<string, string>();

/**
 * The ETag and the body maker of the listing of a type, or of both: the body is made only once while the listing is
 * the same.
 *
 * @param store - The catalogue
 * @param type - Which type, or both
 * @returns Its ETag, and its body as JSON
 */
export async function listingOf(
  store: CatalogueStore,
  type: ListingType | undefined,
): Promise<{ etag: string; body: () => Promise<string> }> {
  const { count, changedAt } = await store.listingStamp(type);
  const etag = `"listing-${type ?? 'all'}-${String(count)}-${String(changedAt?.getTime() ?? 0)}"`;
  return {
    etag,
    body: async () => {
      const kept = made.get(etag);
      if (kept !== undefined) return kept;
      const body = JSON.stringify(
        ListingResponse.parse({
          packages: listedPackages(await store.listing(type)),
          asOf: changedAt?.toISOString() ?? null,
        }),
      );
      // Only the latest of each type is kept.
      for (const key of made.keys()) if (key.startsWith(`"listing-${type ?? 'all'}-`)) made.delete(key);
      made.set(etag, body);
      return body;
    },
  };
}

/**
 * Foundry VTT's builds, as JSON, with an ETag of what they are.
 *
 * @param store - The catalogue
 * @returns Its ETag, and its body as JSON
 */
export async function coreOf(store: CatalogueStore): Promise<{ etag: string; body: string }> {
  const body = JSON.stringify(CoreResponse.parse({ core: await store.coreReleases() }));
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  return { etag: `"core-${hash}"`, body };
}
