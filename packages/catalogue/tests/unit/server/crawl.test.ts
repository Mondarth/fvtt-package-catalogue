import { foundryIndexSource, httpClient, manifestUrlSource } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import { crawlPackage } from '../../../src/lib/server/crawl.js';

import type { Release } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, ReleaseSource } from '@mondarth/fvtt-resolver/sources';

const INDEX = 'https://index.test/index-latest.json';
const MIDI = { type: 'module', id: 'midi-qol' } as const;
const manifestOf = (version: string) => `https://files.test/midi-qol/${version}/module.json`;

/** A manifest of midi-qol, needing lib-wrapper and dnd5e, as its author publishes it. */
const manifest = (version: string, extra: Record<string, unknown> = {}) => ({
  id: 'midi-qol',
  title: 'Midi QOL',
  version,
  compatibility: { minimum: '13', verified: '14' },
  relationships: {
    requires: [{ id: 'lib-wrapper', type: 'module', manifest: 'https://files.test/lib-wrapper/module.json' }],
    systems: [{ id: 'dnd5e', type: 'system' }],
    conflicts: [{ id: 'better-rolls', type: 'module' }],
  },
  manifest: manifestOf(version),
  download: `https://files.test/midi-qol/${version}/module.zip`,
  ...extra,
});

/** Foundry VTT's index, listing midi-qol's versions, and the manifests of those that can be fetched. */
function web(files: Record<string, unknown>) {
  const all: Record<string, unknown> = {
    [INDEX]: {
      details: 'https://index.test/detail/{id}.json',
      packages: [{ id: 'midi-qol', type: 'module', last_updated: '2026-10-01' }],
    },
    'https://index.test/detail/midi-qol.json': {
      versions: ['13.0.4', '13.0.5', '13.1.0'].map(version => ({
        version,
        manifest: manifestOf(version),
        minimum: '13',
        verified: '13',
      })),
    },
    ...files,
  };
  const fetch = vi.fn<typeof globalThis.fetch>(input => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(
      url in all ? Response.json(all[url]) : new Response('not found', { status: 404, statusText: 'Not Found' }),
    );
  });
  return { http: httpClient({ fetch }), fetch };
}

const crawl = (http: HttpClient, held: readonly Release[] = [], manifests: readonly string[] = []) =>
  crawlPackage(MIDI, {
    http,
    sources: [foundryIndexSource(http, { indexUrl: INDEX }), manifestUrlSource(http)],
    core: [],
    held,
    manifests,
  });

describe('crawlPackage', () => {
  it('loads every version the listing gives, from its own manifest', async () => {
    const { http } = web({
      [manifestOf('13.0.4')]: manifest('13.0.4'),
      [manifestOf('13.0.5')]: manifest('13.0.5'),
      [manifestOf('13.1.0')]: manifest('13.1.0'),
    });
    const found = await crawl(http);
    expect(found.releases.map(release => [release.version, release.detail])).toEqual([
      ['13.0.4', 'loaded'],
      ['13.0.5', 'loaded'],
      ['13.1.0', 'loaded'],
    ]);
    expect(found.releases[0]).toMatchObject({
      compatibility: { minimum: '13', verified: '14' },
      listing: { minimum: '13', verified: '13' },
      download: 'https://files.test/midi-qol/13.0.4/module.zip',
    });
    expect(found.gaps).toEqual([]);
  });

  it('names what its releases require or run in, once each, for the closure', async () => {
    const { http } = web({ [manifestOf('13.0.4')]: manifest('13.0.4'), [manifestOf('13.1.0')]: manifest('13.1.0') });
    expect((await crawl(http)).named).toEqual([
      { type: 'module', id: 'lib-wrapper' },
      { type: 'system', id: 'dnd5e' },
    ]);
  });

  it('keeps a release whose manifest cannot be read, as listed and failed, with the gap', async () => {
    const { http } = web({ [manifestOf('13.0.4')]: manifest('13.0.4'), [manifestOf('13.1.0')]: manifest('13.1.0') });
    const found = await crawl(http);
    expect(found.releases.find(release => release.version === '13.0.5')).toMatchObject({
      detail: 'listed',
      loadFailed: true,
    });
    expect(found.gaps).toContainEqual(
      expect.objectContaining({ reason: 'http', status: 404, package: 'module:midi-qol', version: '13.0.5' }),
    );
  });

  it('does not load again a release it holds loaded, but takes the listing as it is now', async () => {
    const { http, fetch } = web({
      [manifestOf('13.0.5')]: manifest('13.0.5'),
      [manifestOf('13.1.0')]: manifest('13.1.0'),
    });
    const held: Release = {
      package: MIDI,
      version: '13.0.4',
      compatibility: { minimum: '13' },
      relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
      protected: false,
      origin: manifestOf('13.0.4'),
      detail: 'loaded',
      listing: { minimum: '12' },
    };
    const found = await crawl(http, [held]);
    expect(found.releases[0]).toEqual({ ...held, listing: { minimum: '13', verified: '13' } });
    expect(fetch).not.toHaveBeenCalledWith(manifestOf('13.0.4'), expect.anything());
  });

  it('leaves out a release the contract would not accept, as a gap, keeping the others', async () => {
    const { http } = web({
      [manifestOf('13.0.4')]: manifest('13.0.4'),
      [manifestOf('13.0.5')]: manifest('13.0.5'),
      // Normalised, the reason is kept; the contract takes only URLs where a manifest gives a download.
      [manifestOf('13.1.0')]: manifest('13.1.0', { download: 'not a url' }),
    });
    const found = await crawl(http);
    expect(found.releases.map(release => release.version)).toEqual(['13.0.4', '13.0.5']);
    expect(found.gaps).toEqual([
      {
        source: 'contract',
        url: 'https://index.test/detail/midi-qol.json',
        reason: 'invalid',
        package: 'module:midi-qol',
        version: '13.1.0',
      },
    ]);
  });

  it('finds a package no listing has by the manifest URLs declared for it', async () => {
    const url = 'https://files.test/elsewhere/module.json';
    const { http } = web({ [url]: { ...manifest('2.0.0'), id: 'elsewhere', manifest: url } });
    const found = await crawlPackage(
      { type: 'module', id: 'elsewhere' },
      {
        http,
        sources: [foundryIndexSource(http, { indexUrl: INDEX }), manifestUrlSource(http)],
        core: [],
        held: [],
        manifests: [url],
      },
    );
    expect(found.releases.map(release => [release.version, release.detail])).toEqual([['2.0.0', 'loaded']]);
  });

  it('gives what the sources could not fetch as gaps of the package', async () => {
    const http = httpClient({ fetch: () => Promise.reject(new Error('offline')) });
    const found = await crawl(http);
    expect(found.releases).toEqual([]);
    expect(found.gaps).toEqual([
      { source: 'foundry-index', url: INDEX, reason: 'network', package: 'module:midi-qol' },
    ]);
  });

  it('gives a gap that names no package as the gap of the package crawled', async () => {
    const { http } = web({});
    const found = await crawlPackage(MIDI, {
      http,
      sources: [
        {
          name: 'elsewhere',
          releases: () =>
            Promise.resolve({ ok: false, gap: { source: 'elsewhere', url: 'https://x.test', reason: 'network' } }),
        },
      ],
      core: [],
      held: [],
      manifests: [],
    });
    expect(found.gaps).toEqual([
      { source: 'elsewhere', url: 'https://x.test', reason: 'network', package: 'module:midi-qol' },
    ]);
  });
});

describe('crawlPackage, with releases newer than the listing offers', () => {
  /** A source, such as GitLab's releases, that lists a version Foundry VTT's index does not offer yet. */
  const ahead = (version: string): ReleaseSource => ({
    name: 'gitlab',
    releases: ref =>
      Promise.resolve({
        ok: true,
        value:
          ref.id !== MIDI.id
            ? []
            : [
                {
                  package: MIDI,
                  version,
                  compatibility: {},
                  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
                  manifest: manifestOf(version),
                  protected: false,
                  origin: 'https://gitlab.test/midi-qol/releases',
                  detail: 'listed',
                },
              ],
      }),
  });
  const everyManifest = (...versions: string[]) =>
    Object.fromEntries(versions.map(version => [manifestOf(version), manifest(version)]));

  it('keeps them, loaded and marked unlisted, for clients to choose only knowingly', async () => {
    const { http } = web(everyManifest('13.0.4', '13.0.5', '13.1.0', '14.6.4'));
    const found = await crawlPackage(MIDI, {
      http,
      sources: [foundryIndexSource(http, { indexUrl: INDEX }), ahead('14.6.4')],
      core: [],
      held: [],
      manifests: [],
    });
    expect(found.releases.map(release => [release.version, release.detail, release.unlisted])).toEqual([
      ['13.0.4', 'loaded', undefined],
      ['13.0.5', 'loaded', undefined],
      ['13.1.0', 'loaded', undefined],
      ['14.6.4', 'loaded', true],
    ]);
  });

  // A release held loaded is kept, not loaded again; whether it is listed is the listing's to say, now.
  it('marks a release held as the listing now has it, listed or not', async () => {
    const { http } = web(everyManifest('13.0.4', '13.0.5'));
    const heldAs = (version: string, unlisted: boolean): Release => ({
      package: MIDI,
      version,
      compatibility: { minimum: '13' },
      relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
      protected: false,
      origin: manifestOf(version),
      detail: 'loaded',
      ...(unlisted && { unlisted: true }),
    });
    const found = await crawlPackage(MIDI, {
      http,
      sources: [foundryIndexSource(http, { indexUrl: INDEX }), ahead('14.6.4')],
      core: [],
      // 13.1.0 was unlisted when it was crawled and is listed now; 14.6.4 is still ahead of the listing.
      held: [heldAs('13.1.0', true), heldAs('14.6.4', false)],
      manifests: [],
    });
    expect(found.releases.find(release => release.version === '13.1.0')).not.toHaveProperty('unlisted');
    expect(found.releases.find(release => release.version === '14.6.4')).toMatchObject({ unlisted: true });
  });
});
