/**
 * Reading a manifest URL a user gives, to install a package from, as EMMA's Install does: whether what it answers is a
 * manifest, and of the type of package asked for. Foundry VTT installs a manifest as whichever type it is asked to, so
 * the type is checked first: by the manifest's file name, `module.json` or `system.json` and their like, and failing
 * that by the fields only a game system's manifest declares. The URL is fetched with `safeFetch`, as any URL a client
 * gives is.
 */
import { Release } from '@mondarth/fvtt-package-catalogue-contract';
import { normaliseManifest } from '@mondarth/fvtt-resolver';

import type { ManifestRequest, ManifestResponse } from '@mondarth/fvtt-package-catalogue-contract';
import type { SafeFetched } from './safe-fetch.js';
import type { CatalogueStore } from './store/types.js';

/** Fields only a game system's manifest declares. */
const SYSTEM_FIELDS: readonly string[] = [
  'initiative',
  'grid',
  'gridDistance',
  'gridUnits',
  'primaryTokenAttribute',
  'secondaryTokenAttribute',
];

/**
 * What a manifest names its package by: its ID, title and version.
 *
 * @param json - What the URL answered, parsed
 * @returns Them, the title its ID if it gives none, or undefined if it is no manifest
 */
export function manifestShape(json: unknown): { id: string; title: string; version: string } | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const { id, title, version } = json as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return undefined;
  if ((typeof version !== 'string' || version === '') && typeof version !== 'number') return undefined;
  return { id, title: typeof title === 'string' && title !== '' ? title : id, version: String(version) };
}

/**
 * The type of package a manifest is of, as far as it shows.
 *
 * @param url - Its URL
 * @param json - It, parsed
 * @returns `module` or `system`, or undefined if it does not show
 */
export function manifestTypeOf(url: string, json: unknown): 'module' | 'system' | undefined {
  // The last segment of its path.
  const file = new URL(url).pathname.toLowerCase().replace(/^.*\//, '');
  if (/^module\b.*\.json$/.test(file)) return 'module';
  if (/^system\b.*\.json$/.test(file)) return 'system';
  const fields = typeof json === 'object' && json !== null ? Object.keys(json) : [];
  return fields.some(field => SYSTEM_FIELDS.includes(field)) ? 'system' : undefined;
}

/**
 * Reads a manifest URL a user gives. A manifest of the type asked for is given as a release whose manifest is the URL,
 * for its version alone, since what it gives is what the user chose; and its package is queued, found by the URL.
 *
 * @param store - The catalogue
 * @param request - The URL, and the type asked for
 * @param fetchGiven - Fetches a URL a client gave, refusing what may not be reached
 * @returns The release, or why there is none
 */
export async function readManifest(
  store: CatalogueStore,
  { url, type }: ManifestRequest,
  fetchGiven: (url: string) => Promise<SafeFetched>,
): Promise<ManifestResponse> {
  const host = new URL(url).hostname;
  const fetched = await fetchGiven(url);
  if (!fetched.ok) {
    return {
      ok: false,
      problem: 'unreadable',
      reason: fetched.reason,
      ...(fetched.reason === 'http' && { status: fetched.status }),
      host,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(fetched.body);
  } catch {
    return { ok: false, problem: 'unreadable', reason: 'invalid', host };
  }
  const shape = manifestShape(json);
  const typed = manifestTypeOf(url, json);
  if (shape !== undefined && typed !== undefined && typed !== type)
    return { ok: false, problem: 'other-type', type: typed };
  const read = shape === undefined ? undefined : normaliseManifest(json, { origin: url, type });
  const release =
    read?.ok === true ? Release.safeParse({ ...read.release, manifest: url, versionManifest: url }) : undefined;
  if (shape === undefined || release?.success !== true) return { ok: false, problem: 'not-manifest' };
  await store.requestCrawl([{ package: release.data.package, reason: 'request', manifest: url }]);
  return { ok: true, title: shape.title, release: release.data };
}
