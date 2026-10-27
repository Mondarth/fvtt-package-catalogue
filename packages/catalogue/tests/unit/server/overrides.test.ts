import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PackageOverrides,
  ignores,
  manifestFor,
  overridden,
  readOverrides,
} from '../../../src/lib/server/overrides.js';

const TEMPLATE = 'https://files.test/bcm/v{version}/module.json';

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
    };
    expect(PackageOverrides.parse(overrides)).toEqual(overrides);
  });

  it.each([
    ['no reason', { 'module:bcm': { manifest: TEMPLATE } }],
    ['an empty reason', { 'module:bcm': { reason: ' ', manifest: TEMPLATE } }],
    ['neither rule', { 'module:bcm': { reason: 'Why' } }],
    ['a template without the version', { 'module:bcm': { reason: 'Why', manifest: 'https://files.test/module.json' } }],
    ['a template that is not a URL', { 'module:bcm': { reason: 'Why', manifest: 'files/{version}.json' } }],
    ['no versions to ignore', { 'module:bcm': { reason: 'Why', ignoreVersions: [] } }],
    ['a field it does not know', { 'module:bcm': { reason: 'Why', manifest: TEMPLATE, download: TEMPLATE } }],
    ['a key that is not a package', { bcm: { reason: 'Why', manifest: TEMPLATE } }],
    ['a world', { 'world:bcm': { reason: 'Why', manifest: TEMPLATE } }],
  ])('refuses %s', (_name, overrides) => {
    expect(PackageOverrides.safeParse(overrides).success).toBe(false);
  });
});

describe('readOverrides', () => {
  it('reads a file of overrides', async () => {
    const path = await file(JSON.stringify({ 'module:bcm': { reason: 'Why', manifest: TEMPLATE } }));
    expect(await readOverrides(path)).toEqual({ 'module:bcm': { reason: 'Why', manifest: TEMPLATE } });
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
    expect(ignores({ reason: 'Why', manifest: TEMPLATE }, '99.test')).toBe(false);
  });
});

describe('overridden', () => {
  const listed = {
    version: '1.0.34',
    detail: 'listed' as const,
    manifest: 'https://files.test/bcm/module.json',
  };

  it("loads a listed release from the override's manifest, and offers it as its version's", () => {
    expect(overridden({ reason: 'Why', manifest: TEMPLATE }, listed)).toEqual({
      ...listed,
      manifest: 'https://files.test/bcm/v1.0.34/module.json',
      versionManifest: 'https://files.test/bcm/v1.0.34/module.json',
    });
  });

  it('keeps the manifest a loaded release gives, offering the override’s as its version’s', () => {
    const loaded = { ...listed, detail: 'loaded' as const };
    expect(overridden({ reason: 'Why', manifest: TEMPLATE }, loaded)).toEqual({
      ...loaded,
      versionManifest: 'https://files.test/bcm/v1.0.34/module.json',
    });
  });

  it('leaves a release be without an override, or one with no manifest', () => {
    expect(overridden(undefined, listed)).toBe(listed);
    expect(overridden({ reason: 'Why', ignoreVersions: ['99.test'] }, listed)).toBe(listed);
  });
});
