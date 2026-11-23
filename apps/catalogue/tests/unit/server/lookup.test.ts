import { PackageRelease, packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { describe, expect, it } from 'vitest';

import { RETRY_AFTER_SECONDS, lookUp, mayRunFrom } from '../../../src/lib/server/lookup.js';
import { mockStore } from '../support/store.js';

import type { Compatibility, PackageRef, Release } from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageDetails, PackageReleases } from '../../../src/lib/server/store/types.js';

const MIDI = { type: 'module', id: 'midi-qol' } as const;
const LIB = { type: 'module', id: 'lib-wrapper' } as const;
const AT = new Date('2026-11-05T09:00:00.000Z');

const release = (
  ref: PackageRef,
  version: string,
  compatibility: Compatibility = {},
  requires: PackageRef[] = [],
): Release => ({
  package: ref,
  version,
  compatibility,
  relationships: {
    requires: requires.map(other => ({ package: other, compatibility: {} })),
    systems: [],
    conflicts: [],
    recommends: [],
  },
  protected: false,
  origin: `https://example.com/${ref.id}/${version}.json`,
  detail: 'loaded',
});

/** A store holding these packages, with these details. */
function storeOf(
  held: Record<string, Partial<PackageReleases>>,
  details: Record<string, Partial<PackageDetails>> = {},
) {
  const store = mockStore();
  store.releasesOfEach.mockImplementation(refs =>
    Promise.resolve(
      new Map(
        refs.flatMap(ref => {
          const found = held[packageKey(ref)];
          return found === undefined
            ? []
            : [[packageKey(ref), { releases: [], asOf: AT, unavailable: null, ...found }] as const];
        }),
      ),
    ),
  );
  store.detailsOf.mockImplementation(refs =>
    Promise.resolve(
      new Map(
        refs.flatMap(ref => {
          const about = details[packageKey(ref)];
          return about === undefined
            ? []
            : [
                [
                  packageKey(ref),
                  {
                    title: null,
                    latest: null,
                    premium: false,
                    syncedAt: AT,
                    ownVersion: null,
                    ownReadAt: null,
                    ownCheckedAt: null,
                    ...about,
                  },
                ] as const,
              ];
        }),
      ),
    ),
  );
  return store;
}

describe('mayRunFrom', () => {
  it('is by the generation of the maximum a release declares; one declaring none, or none readable, may', () => {
    expect(mayRunFrom(release(MIDI, '1', { maximum: '13' }), 14)).toBe(false);
    expect(mayRunFrom(release(MIDI, '1', { maximum: '14.999' }), 14)).toBe(true);
    expect(mayRunFrom(release(MIDI, '1', { maximum: '15' }), 14)).toBe(true);
    expect(mayRunFrom(release(MIDI, '1', { minimum: '10' }), 14)).toBe(true);
    expect(mayRunFrom(release(MIDI, '1', { maximum: 'next' }), 14)).toBe(true);
  });
});

describe('lookUp', () => {
  it('gives each package once, with its releases without their package, and what is known of it', async () => {
    const store = storeOf(
      {
        'module:midi-qol': { releases: [release(MIDI, '13.0.4', { minimum: '13', maximum: '13' }, [LIB])] },
        'module:lib-wrapper': { releases: [release(LIB, '1.12.0')] },
      },
      {
        'module:midi-qol': {
          title: 'Midi QOL',
          latest: '13.0.4',
          premium: false,
          ownVersion: '13.0.4',
          ownReadAt: AT,
          ownCheckedAt: AT,
        },
      },
    );
    const found = await lookUp(store, { packages: [MIDI] });
    expect(found.packages).toEqual([
      {
        package: MIDI,
        title: 'Midi QOL',
        latest: '13.0.4',
        premium: false,
        syncedAt: AT.toISOString(),
        own: { version: '13.0.4', readAt: AT.toISOString(), checkedAt: AT.toISOString() },
        releases: [PackageRelease.parse(release(MIDI, '13.0.4', { minimum: '13', maximum: '13' }, [LIB]))],
      },
      {
        package: LIB,
        title: null,
        latest: null,
        premium: false,
        syncedAt: null,
        own: { version: null, readAt: null, checkedAt: null },
        releases: [PackageRelease.parse(release(LIB, '1.12.0'))],
      },
    ]);
    expect(found).toMatchObject({ pending: [], unavailable: [], unreached: [], asOf: AT.toISOString() });
  });

  it('leaves out releases that cannot run from the generation asked, but for the version installed', async () => {
    const store = storeOf({
      'module:midi-qol': {
        releases: [
          release(MIDI, '12.0.0', { maximum: '12' }),
          release(MIDI, '13.0.4', { maximum: '13' }, [LIB]),
          release(MIDI, '14.0.20', { maximum: '14' }),
        ],
      },
      'module:lib-wrapper': { releases: [release(LIB, '1.12.0')] },
    });
    const found = await lookUp(store, { packages: [{ ...MIDI, installed: 'v13.0.4' }], fromGeneration: 14 });
    expect(found.packages.map(pkg => [pkg.package.id, pkg.releases.map(r => r.version)])).toEqual([
      ['midi-qol', ['13.0.4', '14.0.20']],
      ['lib-wrapper', ['1.12.0']],
    ]);

    const fresh = await lookUp(store, { packages: [MIDI], fromGeneration: 14 });
    expect(fresh.packages.map(pkg => [pkg.package.id, pkg.releases.map(r => r.version)])).toEqual([
      ['midi-qol', ['14.0.20']],
    ]);
  });

  it('gives a package held with none of its releases kept, as held, with none', async () => {
    const store = storeOf({ 'module:midi-qol': { releases: [release(MIDI, '12.0.0', { maximum: '12' })] } });
    const found = await lookUp(store, { packages: [MIDI], fromGeneration: 14 });
    expect(found.packages).toMatchObject([{ package: MIDI, releases: [] }]);
    expect(found.pending).toEqual([]);
  });

  it('queues what it does not hold, with the manifest URL given, to ask again for later', async () => {
    const store = storeOf({});
    const found = await lookUp(store, {
      packages: [{ ...MIDI, manifest: 'https://example.com/midi-qol/module.json' }],
    });
    expect(found.pending).toEqual([{ package: MIDI, retryAfter: RETRY_AFTER_SECONDS }]);
    expect(found.packages).toEqual([]);
    expect(found.asOf).toBeNull();
    expect(store.requestCrawl).toHaveBeenCalledWith([
      { package: MIDI, reason: 'request', manifest: 'https://example.com/midi-qol/module.json' },
    ]);
  });

  it('gives packages that cannot be had, and those whose sources could not all be listed', async () => {
    const store = storeOf({
      'module:midi-qol': { releases: [release(MIDI, '13.0.4')] },
      'module:gone': { unavailable: { reason: 'gone' } },
    });
    store.gapsOf.mockResolvedValue([
      { source: 'github', url: 'https://api.github.com/x', reason: 'http', status: 500, package: 'module:midi-qol' },
      { source: 'github', url: 'https://api.github.com/y', reason: 'network', package: 'module:midi-qol' },
      {
        source: 'manifest',
        url: 'https://example.com/old.json',
        reason: 'http',
        package: 'module:midi-qol',
        version: '1.0.0',
      },
      { source: 'github', url: 'https://api.github.com/z', reason: 'http', package: 'module:gone' },
      { source: 'foundry-index', url: 'https://index', reason: 'network' },
    ]);
    const found = await lookUp(store, { packages: [MIDI, { type: 'module', id: 'gone' }] });
    expect(found.unavailable).toEqual([{ package: { type: 'module', id: 'gone' }, reason: 'gone' }]);
    expect(found.unreached).toEqual([MIDI]);
  });
});
