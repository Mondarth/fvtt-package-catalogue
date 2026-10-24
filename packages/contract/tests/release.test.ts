import { describe, expect, it } from 'vitest';

import { Compatibility, CoreRelease, Release, SourceGap, Universe } from '../src/index.js';
import { listed, loaded } from './fixtures.js';

describe('Release', () => {
  it.each([
    ['a loaded release', loaded],
    ['a listed release', listed],
  ])('accepts %s unchanged', (_label, release) => {
    expect(Release.parse(release)).toEqual(release);
  });

  it('leaves a missing optional field missing, never undefined', () => {
    expect(Object.keys(Release.parse(listed))).not.toContain('download');
  });

  it.each([
    ['an empty version', { ...listed, version: '' }],
    ['an unknown detail', { ...listed, detail: 'guessed' }],
    ['a manifest that is not a URL', { ...listed, manifest: 'module.json' }],
    ['a package id with a slash', { ...listed, package: { type: 'module', id: 'a/b' } }],
    ['an unknown package type', { ...listed, package: { type: 'theme', id: 'x' } }],
    ['missing relationships', { ...listed, relationships: { requires: [] } }],
  ])('rejects %s', (_label, value) => {
    expect(Release.safeParse(value).success).toBe(false);
  });

  it('rejects an optional field given as undefined, which JSON cannot carry', () => {
    expect(Compatibility.safeParse({ minimum: undefined }).success).toBe(false);
  });
});

describe('CoreRelease', () => {
  it('accepts a build', () => {
    expect(CoreRelease.parse({ version: '14.368', generation: 14, channel: 'stable' }).version).toBe('14.368');
  });

  it.each([
    ['a SemVer version', { version: '14.0.0', generation: 14, channel: 'stable' }],
    ['generation zero', { version: '0.368', generation: 0, channel: 'stable' }],
    ['an unknown channel', { version: '14.368', generation: 14, channel: 'nightly' }],
  ])('rejects %s', (_label, value) => {
    expect(CoreRelease.safeParse(value).success).toBe(false);
  });
});

describe('Universe', () => {
  it('accepts core releases with releases', () => {
    const universe = { core: [{ version: '14.368', generation: 14, channel: 'stable' }], releases: [loaded, listed] };
    expect(Universe.parse(universe)).toEqual(universe);
  });
});

describe('SourceGap', () => {
  it('accepts what a source reports', () => {
    const gap = { source: 'foundry-index', url: 'https://example.com', reason: 'http', status: 503 };
    expect(SourceGap.parse(gap)).toEqual(gap);
  });

  it('rejects an unknown reason', () => {
    expect(SourceGap.safeParse({ source: 'x', url: 'y', reason: 'timeout' }).success).toBe(false);
  });
});
