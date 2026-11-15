import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import {
  PackageOverrides,
  confirmedManifest,
  ignores,
  manifestFor,
  overridden,
  readOverrides,
  unavailableOf,
} from '../../../src/lib/server/overrides.js';

const TEMPLATE = 'https://files.test/bcm/v{version}/module.json';
const BCM = { type: 'module', id: 'baileywiki-content' } as const;

/** Writes a file of overrides in a directory of its own. */
async function file(text: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'overrides-')), 'overrides.json');
  await writeFile(path, text);
  return path;
}

describe('PackageOverrides', () => {
  it('reads a manifest template and versions to ignore, each with a reason', () => {
    const overrides = {
      'module:bcm': { reason: 'The listing gives the latest manifest', manifest: TEMPLATE },
      'system:junk': { reason: 'A test tag', ignoreVersions: ['99.test'] },
      'module:lost': { reason: 'Its repository was deleted', gone: true },
    };
    expect(PackageOverrides.parse(overrides)).toEqual({
      ...overrides,
      'module:bcm': { ...overrides['module:bcm'], manifest: [TEMPLATE] },
    });
  });

  it('reads several manifest templates, to try in order', () => {
    const templates = [TEMPLATE, 'https://mods.test/manifest/bcm?version={version}'];
    expect(PackageOverrides.parse({ 'module:bcm': { reason: 'Why', manifest: templates } })).toEqual({
      'module:bcm': { reason: 'Why', manifest: templates },
    });
  });

  it.each([
    ['no reason', { 'module:bcm': { manifest: TEMPLATE } }],
    ['an empty reason', { 'module:bcm': { reason: ' ', manifest: TEMPLATE } }],
    ['neither rule', { 'module:bcm': { reason: 'Why' } }],
    ['a template without the version', { 'module:bcm': { reason: 'Why', manifest: 'https://files.test/module.json' } }],
    ['a template that is not a URL', { 'module:bcm': { reason: 'Why', manifest: 'files/{version}.json' } }],
    ['no templates', { 'module:bcm': { reason: 'Why', manifest: [] } }],
    [
      'a template without the version among several',
      { 'module:bcm': { reason: 'Why', manifest: [TEMPLATE, 'https://files.test/module.json'] } },
    ],
    ['no versions to ignore', { 'module:bcm': { reason: 'Why', ignoreVersions: [] } }],
    ['a field it does not know', { 'module:bcm': { reason: 'Why', manifest: TEMPLATE, download: TEMPLATE } }],
    ['a key that is not a package', { bcm: { reason: 'Why', manifest: TEMPLATE } }],
    ['a world', { 'world:bcm': { reason: 'Why', manifest: TEMPLATE } }],
    ['gone, false', { 'module:bcm': { reason: 'Why', gone: false } }],
    ['gone, with a manifest', { 'module:bcm': { reason: 'Why', gone: true, manifest: TEMPLATE } }],
    ['gone, with versions to ignore', { 'module:bcm': { reason: 'Why', gone: true, ignoreVersions: ['1.0.0'] } }],
  ])('refuses %s', (_name, overrides) => {
    expect(PackageOverrides.safeParse(overrides).success).toBe(false);
  });
});

describe('readOverrides', () => {
  it('reads a file of overrides', async () => {
    const path = await file(JSON.stringify({ 'module:bcm': { reason: 'Why', manifest: TEMPLATE } }));
    expect(await readOverrides(path)).toEqual({ 'module:bcm': { reason: 'Why', manifest: [TEMPLATE] } });
  });

  it('names the problem with an invalid file, and where it is', async () => {
    const path = await file(JSON.stringify({ 'module:bcm': { reason: 'Why', manifest: 'https://files.test/m.json' } }));
    await expect(readOverrides(path)).rejects.toThrow(/Invalid package overrides in [\s\S]*\{version\}[\s\S]*manifest/);
  });

  it('says when the file is not JSON', async () => {
    await expect(readOverrides(await file('{ nope'))).rejects.toThrow(/are not JSON/);
  });

  it('fails when there is no file', async () => {
    await expect(readOverrides(join(tmpdir(), 'no-such-overrides.json'))).rejects.toThrow(/ENOENT/);
  });

  it('accepts the overrides the catalogue ships', async () => {
    const shipped = await readOverrides('overrides.json');
    expect(Object.keys(shipped)).toContain('module:baileywiki-content');
  });
});

describe('manifestFor', () => {
  it('puts the version in the template, as a URL may hold it', () => {
    expect(manifestFor(TEMPLATE, '1.0.34')).toBe('https://files.test/bcm/v1.0.34/module.json');
    expect(manifestFor('https://files.test/{version}/{version}.json', '1.0 beta')).toBe(
      'https://files.test/1.0%20beta/1.0%20beta.json',
    );
  });
});

describe('ignores', () => {
  const override = { reason: 'Why', ignoreVersions: ['99.test'] };

  it('ignores the versions given, with or without a leading v', () => {
    expect(ignores(override, '99.test')).toBe(true);
    expect(ignores(override, 'v99.test')).toBe(true);
    expect(ignores({ reason: 'Why', ignoreVersions: ['v1.0.0'] }, '1.0.0')).toBe(true);
  });

  it('ignores nothing else, nor without an override or versions to ignore', () => {
    expect(ignores(override, '3.3.8')).toBe(false);
    expect(ignores(undefined, '99.test')).toBe(false);
    expect(ignores({ reason: 'Why', manifest: [TEMPLATE] }, '99.test')).toBe(false);
  });
});

describe('confirmedManifest', () => {
  const OWN = 'https://files.test/bcm/v1.0.36/module.json';
  const MODS = 'https://mods.test/manifest/bcm?version={version}';
  const of = (version: string, id = 'baileywiki-content') => ({ id, version });

  /** A web holding the given manifests, by URL; anything else is not found. */
  function web(files: Record<string, unknown>) {
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const url = input instanceof Request ? input.url : String(input);
      return Promise.resolve(url in files ? Response.json(files[url]) : new Response('', { status: 404 }));
    });
    return { http: httpClient({ fetch }), fetch };
  }

  it('confirms the URL whose manifest is of the package at the version', async () => {
    const { http } = web({ [OWN]: of('1.0.36') });
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.36')).toBe(OWN);
  });

  // Regression: Baileywiki 1.0.37 was offered https://download.bailey.wiki/bcm/v1.0.37/module.json, which its author
  // never published: an override's URL was offered unchecked.
  it('confirms none that cannot be fetched', async () => {
    const { http } = web({});
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.37')).toBeUndefined();
  });

  it('confirms none that gives another version, as a host does for a version it does not hold', async () => {
    const { http } = web({ 'https://mods.test/manifest/bcm?version=1.0.0': of('1.0.37') });
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [MODS] }, BCM, '1.0.0')).toBeUndefined();
  });

  it('confirms none of another package, or that is not a manifest', async () => {
    const { http } = web({ [OWN]: of('1.0.36', 'another') });
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.36')).toBeUndefined();
    const nameless = web({ [OWN]: { version: '1.0.36' } });
    expect(
      await confirmedManifest(nameless.http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.36'),
    ).toBeUndefined();
    const notOne = web({ [OWN]: 'not a manifest' });
    expect(
      await confirmedManifest(notOne.http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.36'),
    ).toBeUndefined();
  });

  it('reads a legacy manifest’s name, ignoring case, and a version with a leading v', async () => {
    const { http } = web({ [OWN]: { name: 'Baileywiki-Content', version: 'v1.0.36' } });
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [TEMPLATE] }, BCM, '1.0.36')).toBe(OWN);
  });

  it('tries the templates in order, taking the first confirmed', async () => {
    const mods = 'https://mods.test/manifest/bcm?version=1.0.37';
    const { http, fetch } = web({ [mods]: of('1.0.37') });
    expect(await confirmedManifest(http, { reason: 'Why', manifest: [TEMPLATE, MODS] }, BCM, '1.0.37')).toBe(mods);
    const both = web({ [OWN]: of('1.0.36'), 'https://mods.test/manifest/bcm?version=1.0.36': of('1.0.36') });
    expect(await confirmedManifest(both.http, { reason: 'Why', manifest: [TEMPLATE, MODS] }, BCM, '1.0.36')).toBe(OWN);
    expect(both.fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps a URL confirmed, asking again for one that is not', async () => {
    const files: Record<string, unknown> = { [OWN]: of('1.0.36') };
    const { http, fetch } = web(files);
    const override = { reason: 'Why', manifest: [TEMPLATE] };
    await confirmedManifest(http, override, BCM, '1.0.36');
    await confirmedManifest(http, override, BCM, '1.0.36');
    expect(fetch).toHaveBeenCalledTimes(1);

    await confirmedManifest(http, override, BCM, '1.0.37');
    files['https://files.test/bcm/v1.0.37/module.json'] = of('1.0.37');
    expect(await confirmedManifest(http, override, BCM, '1.0.37')).toBe('https://files.test/bcm/v1.0.37/module.json');
  });

  it('confirms nothing without an override, or one with no manifest', async () => {
    const { http, fetch } = web({});
    expect(await confirmedManifest(http, undefined, BCM, '1.0.36')).toBeUndefined();
    expect(await confirmedManifest(http, { reason: 'Why', ignoreVersions: ['9'] }, BCM, '1.0.36')).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('overridden', () => {
  const OWN = 'https://files.test/bcm/v1.0.34/module.json';
  const override = { reason: 'Why', manifest: [TEMPLATE] };
  const listed = {
    version: '1.0.34',
    detail: 'listed' as const,
    manifest: 'https://files.test/bcm/module.json',
  };

  it('loads a listed release from the confirmed manifest, and offers it as its version’s', () => {
    expect(overridden(override, listed, OWN)).toEqual({ ...listed, manifest: OWN, versionManifest: OWN });
  });

  it('keeps the manifest a loaded release gives, offering the confirmed one as its version’s', () => {
    const loaded = { ...listed, detail: 'loaded' as const };
    expect(overridden(override, loaded, OWN)).toEqual({ ...loaded, versionManifest: OWN });
  });

  it('offers none of the override’s when none is confirmed, taking away one it made unchecked', () => {
    const stamped = { ...listed, detail: 'loaded' as const, versionManifest: OWN };
    expect(overridden(override, stamped, undefined)).toEqual({ ...listed, detail: 'loaded' });
    expect(overridden(override, listed, undefined)).toEqual(listed);
  });

  it('keeps a manifest for the version its sources gave otherwise, when none of the override’s is confirmed', () => {
    const given = { ...listed, versionManifest: 'https://elsewhere.test/bcm-1.0.34.json' };
    expect(overridden(override, given, undefined)).toEqual(given);
  });

  it('leaves a release be without an override, or one with no manifest', () => {
    expect(overridden(undefined, listed, OWN)).toBe(listed);
    expect(overridden({ reason: 'Why', ignoreVersions: ['99.test'] }, listed, OWN)).toBe(listed);
  });
});

describe('unavailableOf', () => {
  it('gives a package its override says is gone as gone, with the reason as the note, archived or not', () => {
    const gone = { reason: 'Its repository was deleted', gone: true as const };
    expect(unavailableOf(gone, false)).toEqual({ reason: 'gone', note: 'Its repository was deleted' });
    expect(unavailableOf(gone, true)).toEqual({ reason: 'gone', note: 'Its repository was deleted' });
  });

  it('gives a package the index archives as archived, and any other as available', () => {
    expect(unavailableOf(undefined, true)).toEqual({ reason: 'archived' });
    expect(unavailableOf({ reason: 'Why', manifest: [TEMPLATE] }, true)).toEqual({ reason: 'archived' });
    expect(unavailableOf(undefined, false)).toBeNull();
    expect(unavailableOf({ reason: 'Why', manifest: [TEMPLATE] }, false)).toBeNull();
  });
});
