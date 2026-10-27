/**
 * Package overrides: what the catalogue is told of packages whose sources mislead it, such as a listing that gives the
 * same "latest" manifest URL for every version, or a junk release tag. They are kept in a file, reviewed like code,
 * which the worker reads when it starts; a crawl of a package applies its override to the releases the sources list.
 */
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import type { Release } from '@mondarth/fvtt-package-catalogue-contract';

/** Where in a manifest URL template a release's version goes. */
export const VERSION_PLACEHOLDER = '{version}';

/** A package key, `module:<id>` or `system:<id>`: the catalogue crawls no worlds. */
const OverrideKey = z.string().regex(/^(?:module|system):[^\s:]+$/, 'a package key, such as module:<id>');

/** A URL with the version placeholder in it, which makes a URL with any version put in its place. */
const ManifestTemplate = z
  .string()
  .refine(template => template.includes(VERSION_PLACEHOLDER), `must include ${VERSION_PLACEHOLDER}`)
  .refine(template => z.url().safeParse(manifestFor(template, '1.0.0')).success, 'must make a URL');

/** What the catalogue is told of one package. */
export const PackageOverride = z
  .strictObject({
    /** Why the package needs it: what its sources get wrong. */
    reason: z.string().trim().min(1),
    /**
     * The manifest URL of each version, with {@link VERSION_PLACEHOLDER} for the version as listed. Each release is
     * loaded from it in place of the manifest its listing gives, and offers it as its own version's manifest.
     */
    manifest: ManifestTemplate.optional(),
    /** Versions the sources list that are not releases of the package, such as a test build's tag: left out. */
    ignoreVersions: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .refine(entry => entry.manifest !== undefined || entry.ignoreVersions !== undefined, {
    message: 'needs a manifest, ignoreVersions, or both',
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

/**
 * A release as an override has it: one still to load is loaded from the override's manifest; every one offers that
 * manifest as its own version's.
 *
 * @param override - The package's override, if it has one
 * @param release - The release, as listed or held
 * @returns The release, changed only if the override gives a manifest
 */
export function overridden<T extends Pick<Release, 'version' | 'detail' | 'manifest' | 'versionManifest'>>(
  override: PackageOverride | undefined,
  release: T,
): T {
  if (override?.manifest === undefined) return release;
  const manifest = manifestFor(override.manifest, release.version);
  return { ...release, ...(release.detail === 'listed' && { manifest }), versionManifest: manifest };
}
