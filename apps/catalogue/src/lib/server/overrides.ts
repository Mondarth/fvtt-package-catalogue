/**
 * Package overrides: what the catalogue is told of packages whose sources mislead it, such as a listing that gives the
 * same "latest" manifest URL for every version, or a junk release tag. They are kept in a file, reviewed like code,
 * which the worker reads when it starts; a crawl of a package applies its override to the releases the sources list.
 */
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { sameVersion } from '@mondarth/fvtt-resolver';

import type { PackageRef, Release } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { Unavailable } from './store/types.js';

/** Where in a manifest URL template a release's version goes. */
export const VERSION_PLACEHOLDER = '{version}';

/** A package key, `module:<id>` or `system:<id>`: the catalogue crawls no worlds. */
const OverrideKey = z.string().regex(/^(?:module|system):[^\s:]+$/, 'a package key, such as module:<id>');

/** A URL with the version placeholder in it, which makes a URL with any version put in its place. */
const ManifestTemplate = z
  .string()
  .refine(template => template.includes(VERSION_PLACEHOLDER), `must include ${VERSION_PLACEHOLDER}`)
  .refine(template => z.url().safeParse(manifestFor(template, '1.0.0')).success, 'must make a URL');

/** One template, or several to try in order, as a package's author moves its manifests: always a list once read. */
const ManifestTemplates = z
  .union([ManifestTemplate, z.array(ManifestTemplate).min(1)])
  .transform(templates => (typeof templates === 'string' ? [templates] : templates));

/** What the catalogue is told of one package. */
export const PackageOverride = z
  .strictObject({
    /** Why the package needs it: what its sources get wrong. */
    reason: z.string().trim().min(1),
    /**
     * The manifest URL of each version, with {@link VERSION_PLACEHOLDER} for the version as listed: one template, or
     * several, tried in order. A release takes the first URL whose manifest is of this package at this version (see
     * {@link confirmedManifest}), and is loaded from it in place of the manifest its listing gives, and offers it as
     * its own version's manifest. A URL that is not confirmed is never offered.
     */
    manifest: ManifestTemplates.optional(),
    /** Versions the sources list that are not releases of the package, such as a test build's tag: left out. */
    ignoreVersions: z.array(z.string().trim().min(1)).min(1).optional(),
    /**
     * The package's files are no longer there, such as when its repository was deleted, though its listing remains:
     * none of it is fetched, and clients are told it cannot be had, with the reason as the note.
     */
    gone: z.literal(true).optional(),
  })
  .refine(entry => entry.manifest !== undefined || entry.ignoreVersions !== undefined || entry.gone === true, {
    message: 'needs a manifest, ignoreVersions or gone',
  })
  .refine(entry => entry.gone !== true || (entry.manifest === undefined && entry.ignoreVersions === undefined), {
    message: 'a package gone has no releases to load or ignore',
  });
export type PackageOverride = z.infer<typeof PackageOverride>;

/** Every override, by package key. */
export const PackageOverrides = z.record(OverrideKey, PackageOverride);
export type PackageOverrides = z.infer<typeof PackageOverrides>;

/**
 * Reads the overrides from a file.
 *
 * @param path - The JSON file
 * @returns The overrides
 * @throws {Error} When the file cannot be read, is not JSON, or any override is invalid, naming each problem
 */
export async function readOverrides(path: string): Promise<PackageOverrides> {
  const text = await readFile(path, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`The package overrides in ${path} are not JSON`, { cause: error });
  }
  const read = PackageOverrides.safeParse(json);
  if (!read.success) throw new Error(`Invalid package overrides in ${path}:\n${z.prettifyError(read.error)}`);
  return read.data;
}

/**
 * Why a package cannot be had, if it cannot: gone, as its override says, or archived, as Foundry VTT's index says.
 *
 * @param override - The package's override, if it has one
 * @param archived - Whether the index says its listing is archived
 * @returns Why, or null if it can be had
 */
export function unavailableOf(override: PackageOverride | undefined, archived: boolean): Unavailable | null {
  if (override?.gone === true) return { reason: 'gone', note: override.reason };
  return archived ? { reason: 'archived' } : null;
}

/** A version without the leading `v` some sources give it. */
const unprefixed = (version: string) => version.replace(/^v/, '');

/**
 * The manifest URL a template gives for a version.
 *
 * @param template - The template
 * @param version - The version, as listed
 * @returns The URL
 */
export function manifestFor(template: string, version: string): string {
  return template.replaceAll(VERSION_PLACEHOLDER, encodeURIComponent(version));
}

/**
 * Whether an override leaves a version out.
 *
 * @param override - The package's override, if it has one
 * @param version - The version, as listed
 * @returns `true` if it is not a release of the package
 */
export function ignores(override: PackageOverride | undefined, version: string): boolean {
  return override?.ignoreVersions?.some(ignored => unprefixed(ignored) === unprefixed(version)) === true;
}

/** How long a confirmed manifest URL is trusted: a version's own manifest does not change. */
const CONFIRMED_FOR = Number.POSITIVE_INFINITY;

/**
 * Whether a manifest is of a package at a version: its id, or a legacy manifest's name, is the package's, ignoring
 * case, as Foundry VTT's listing may, and its version is the one asked for.
 *
 * @param value - The manifest, as fetched
 * @param ref - The package
 * @param version - The version
 * @returns `true` if it is
 */
function isManifestOf(value: unknown, ref: PackageRef, version: string): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, version: given } = value as Record<string, unknown>;
  const manifestId = typeof id === 'string' ? id : typeof name === 'string' ? name : undefined;
  return manifestId?.toLowerCase() === ref.id.toLowerCase() && typeof given === 'string' && sameVersion(given, version);
}

/**
 * The manifest URL an override gives for a version, once confirmed: the first of its templates whose manifest can be
 * fetched and is of this package at this version. A host may answer a version it does not hold with its newest, as
 * foundrymods.com does, or not at all, as an author who stops publishing a manifest for each version does: neither
 * is confirmed. A URL confirmed is kept for good; one that is not is asked again next time, as it may be published
 * later.
 *
 * @param http - The crawl's client
 * @param override - The package's override, if it has one
 * @param ref - The package
 * @param version - The version, as listed
 * @returns The URL, or `undefined` if the override gives none or none is confirmed
 */
export async function confirmedManifest(
  http: HttpClient,
  override: PackageOverride | undefined,
  ref: PackageRef,
  version: string,
): Promise<string | undefined> {
  for (const template of override?.manifest ?? []) {
    const url = manifestFor(template, version);
    const confirmed = await http.remember(`confirmed-manifest:${url}`, CONFIRMED_FOR, async () => {
      const fetched = await http.getJson(url, { maxAge: 0 });
      return fetched.ok && isManifestOf(fetched.value, ref, version)
        ? { ok: true as const, value: url }
        : { ok: false as const, gap: { url, reason: 'invalid' as const } };
    });
    if (confirmed.ok) return confirmed.value;
  }
  return undefined;
}

/**
 * A release as an override has it: given the manifest URL confirmed for its version (see {@link confirmedManifest}),
 * one still to load is loaded from it, and every one offers it as its own version's manifest. One that no template
 * confirms offers none of the override's: a URL a template made, but not confirmed, such as one an older catalogue
 * offered unchecked, is taken away; one its sources gave otherwise is kept.
 *
 * @param override - The package's override, if it has one
 * @param release - The release, as listed or held
 * @param confirmed - The manifest URL confirmed for its version, if any
 * @returns The release, changed only if the override gives a manifest
 */
export function overridden<T extends Pick<Release, 'version' | 'detail' | 'manifest' | 'versionManifest'>>(
  override: PackageOverride | undefined,
  release: T,
  confirmed: string | undefined,
): T {
  const templates = override?.manifest;
  if (templates === undefined) return release;
  const made = (url: string) => templates.some(template => manifestFor(template, release.version) === url);
  const own =
    confirmed ??
    (release.versionManifest !== undefined && !made(release.versionManifest) ? release.versionManifest : undefined);
  const result: T = {
    ...release,
    ...(confirmed !== undefined && release.detail === 'listed' && { manifest: confirmed }),
  };
  if (own === undefined) delete result.versionManifest;
  else result.versionManifest = own;
  return result;
}
