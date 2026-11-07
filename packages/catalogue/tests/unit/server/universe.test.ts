import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { describe, expect, it } from 'vitest';

import { gatherUniverse } from '../../../src/lib/server/universe.js';
import { mockStore } from '../support/store.js';

import type { PackageRef, Relationship, Release } from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageReleases } from '../../../src/lib/server/store/types.js';

const ref = (key: string): PackageRef => {
  const [type, id] = key.split(':') as [PackageRef['type'], string];
  return { type, id };
};
const on = (key: string): Relationship => ({ package: ref(key), compatibility: {} });

/** A release of a package, relating to others by key. */
function release(
  key: string,
  version: string,
  related: Partial<Record<keyof Release['relationships'], string[]>> = {},
): Release {
  return {
    package: ref(key),
    version,
    compatibility: {},
    relationships: {
      requires: (related.requires ?? []).map(on),
      systems: (related.systems ?? []).map(on),
      conflicts: (related.conflicts ?? []).map(on),
      recommends: (related.recommends ?? []).map(on),
    },
    protected: false,
    origin: `https://example.com/${key}.json`,
    detail: 'loaded',
  };
}

const EARLY = new Date('2026-10-24T08:00:00.000Z');
const LATE = new Date('2026-10-24T09:00:00.000Z');

/** A store holding these packages, each available unless said otherwise, which records what it is asked. */
function storeOf(held: Record<string, Omit<PackageReleases, 'unavailable'> & Partial<PackageReleases>>) {
  const store = mockStore();
  store.releasesOfEach.mockImplementation(refs =>
    Promise.resolve(
      new Map(
        refs.flatMap(r => {
          const found = held[packageKey(r)];
          return found === undefined ? [] : [[packageKey(r), { unavailable: null, ...found }] as const];
        }),
      ),
    ),
  );
  return store;
}

const keysOf = (releases: readonly Release[]) => releases.map(r => `${packageKey(r.package)}@${r.version}`);

describe('gatherUniverse', () => {
  it('gives the packages asked for and what every version of them requires or runs in, all the way down', async () => {
    const store = storeOf({
      'module:midi-qol': {
        releases: [
          release('module:midi-qol', '12.0.0', { requires: ['module:socketlib'] }),
          release('module:midi-qol', '13.0.0', { requires: ['module:lib-wrapper'], systems: ['system:dnd5e'] }),
        ],
        asOf: LATE,
      },
      'module:lib-wrapper': {
        releases: [release('module:lib-wrapper', '1.12.0', { requires: ['module:deep'] })],
        asOf: LATE,
      },
      'module:socketlib': { releases: [release('module:socketlib', '1.0.0')], asOf: LATE },
      'system:dnd5e': { releases: [release('system:dnd5e', '5.1.0')], asOf: LATE },
      'module:deep': { releases: [release('module:deep', '0.1.0')], asOf: LATE },
    });
    const found = await gatherUniverse(store, [ref('module:midi-qol')]);
    expect(keysOf(found.universe.releases)).toEqual([
      'module:midi-qol@12.0.0',
      'module:midi-qol@13.0.0',
      'module:socketlib@1.0.0',
      'module:lib-wrapper@1.12.0',
      'system:dnd5e@5.1.0',
      'module:deep@0.1.0',
    ]);
    expect(found.pending).toEqual([]);
    // One read of the store for each level of the closure, not one for each package.
    expect(store.releasesOfEach).toHaveBeenCalledTimes(3);
  });

  it('leaves out what releases conflict with or recommend, and worlds, as the resolver does', async () => {
    const store = storeOf({
      'module:a': {
        releases: [
          release('module:a', '1', { conflicts: ['module:b'], recommends: ['module:c'], requires: ['world:w'] }),
        ],
        asOf: LATE,
      },
    });
    const found = await gatherUniverse(store, [ref('module:a')]);
    expect(keysOf(found.universe.releases)).toEqual(['module:a@1']);
    expect(found.pending).toEqual([]);
    expect(store.requestCrawl).not.toHaveBeenCalled();
  });

  it('asks for each package once, however often it is named or needed', async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1', { requires: ['module:b'] })], asOf: LATE },
      'module:b': { releases: [release('module:b', '1', { requires: ['module:a', 'module:b'] })], asOf: LATE },
    });
    const found = await gatherUniverse(store, [ref('module:a'), ref('module:a'), ref('module:b')]);
    expect(keysOf(found.universe.releases)).toEqual(['module:a@1', 'module:b@1']);
    expect(store.releasesOfEach).toHaveBeenCalledOnce();
    expect(store.releasesOfEach).toHaveBeenCalledWith([ref('module:a'), ref('module:b')]);
  });

  it('gives what it does not hold as pending, and queues it: asked for, or needed by the closure', async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1', { requires: ['module:missing'] })], asOf: LATE },
    });
    const found = await gatherUniverse(store, [ref('module:a'), ref('module:unknown')]);
    expect(found.pending).toEqual([ref('module:unknown'), ref('module:missing')]);
    expect(store.requestCrawl).toHaveBeenCalledExactlyOnceWith([
      { package: ref('module:unknown'), reason: 'request' },
      { package: ref('module:missing'), reason: 'closure' },
    ]);
  });

  // Regression: the EMMA module, outside Foundry VTT's listing, was crawled once before clients gave the manifest URL it is
  // found by, so was held with no releases, and never crawled again, however often clients asked for it with the URL.
  it('crawls again a package held with no releases when asked for it, with its manifest, once an hour at most', async () => {
    const now = new Date(LATE.getTime() + 2 * 60 * 60 * 1000);
    const manifest = 'https://raw.example.com/emma/module.json';
    const store = storeOf({
      'module:emma': { releases: [], asOf: LATE },
      'module:new': { releases: [], asOf: new Date(now.getTime() - 10 * 60 * 1000) },
      'module:never': { releases: [], asOf: null },
      'module:full': { releases: [release('module:full', '1')], asOf: EARLY },
    });
    const found = await gatherUniverse(
      store,
      [ref('module:emma'), ref('module:new'), ref('module:never'), ref('module:full')],
      { hints: new Map([['module:emma', manifest]]), now },
    );
    expect(found.pending).toEqual([ref('module:emma'), ref('module:never')]);
    expect(found.held).toEqual([ref('module:new'), ref('module:full')]);
    expect(store.requestCrawl).toHaveBeenCalledExactlyOnceWith([
      { package: ref('module:emma'), reason: 'request', manifest },
      { package: ref('module:never'), reason: 'request' },
    ]);
    // Still as of when what it holds was crawled.
    expect(found.asOf).toBeNull();
  });

  it("gives Foundry VTT's builds, and the gaps of every package in the closure, held or pending", async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1', { requires: ['module:missing'] })], asOf: LATE },
    });
    const core = [{ version: '14.368', generation: 14, channel: 'stable' }] as const;
    const gaps = [
      { source: 'foundry-index', url: 'https://example.com', reason: 'http', package: 'module:a' },
    ] as const;
    store.coreReleases.mockResolvedValue([...core]);
    store.gapsOf.mockResolvedValue([...gaps]);
    const found = await gatherUniverse(store, [ref('module:a')]);
    expect(found.universe.core).toEqual(core);
    expect(found.gaps).toEqual(gaps);
    expect(store.gapsOf).toHaveBeenCalledWith(['module:a', 'module:missing']);
  });

  it('is as of the oldest time a package held was brought up to date', async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1', { requires: ['module:b'] })], asOf: LATE },
      'module:b': { releases: [], asOf: EARLY },
    });
    expect((await gatherUniverse(store, [ref('module:a')])).asOf).toEqual(EARLY);
  });

  it('is as of no time if a package held never was, or none is held', async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1', { requires: ['module:b'] })], asOf: LATE },
      'module:b': { releases: [], asOf: null },
    });
    expect((await gatherUniverse(store, [ref('module:a')])).asOf).toBeNull();
    expect((await gatherUniverse(store, [ref('module:unknown')])).asOf).toBeNull();
  });

  it('gives the packages that cannot be had, and why, following none of them', async () => {
    const store = storeOf({
      'module:midi-qol': {
        releases: [release('module:midi-qol', '13.0.0', { requires: ['module:babonus', 'module:lost'] })],
        asOf: LATE,
      },
      'module:babonus': { releases: [], asOf: EARLY, unavailable: { reason: 'archived' } },
      'module:lost': { releases: [], asOf: LATE, unavailable: { reason: 'gone', note: 'Its repository was deleted' } },
    });
    const found = await gatherUniverse(store, [ref('module:midi-qol')]);
    expect(keysOf(found.universe.releases)).toEqual(['module:midi-qol@13.0.0']);
    expect(found.unavailable).toEqual([
      { package: ref('module:babonus'), reason: 'archived' },
      { package: ref('module:lost'), reason: 'gone', note: 'Its repository was deleted' },
    ]);
    expect(found.pending).toEqual([]);
    expect(found.asOf).toEqual(EARLY);
    expect(store.releasesOfEach).toHaveBeenCalledTimes(2);
  });
});

describe('gatherUniverse, with options', () => {
  it('gives only the releases kept, and follows only what they need', async () => {
    const store = storeOf({
      'module:a': {
        releases: [
          release('module:a', '1.0.0', { requires: ['module:old'] }),
          release('module:a', '2.0.0', { requires: ['module:new'] }),
        ],
        asOf: LATE,
      },
      'module:old': { releases: [release('module:old', '1.0.0')], asOf: LATE },
      'module:new': { releases: [release('module:new', '1.0.0')], asOf: LATE },
    });
    const found = await gatherUniverse(store, [ref('module:a')], {
      keep: r => r.version !== '1.0.0' || r.package.id === 'new',
    });
    expect(keysOf(found.universe.releases)).toEqual(['module:a@2.0.0', 'module:new@1.0.0']);
    expect(found.held).toEqual([ref('module:a'), ref('module:new')]);
  });

  it('gives the packages held, available, in the order met, though none of their releases is kept', async () => {
    const store = storeOf({
      'module:a': { releases: [release('module:a', '1.0.0')], asOf: LATE },
      'module:gone': { releases: [], asOf: LATE, unavailable: { reason: 'gone' } },
    });
    const found = await gatherUniverse(store, [ref('module:a'), ref('module:gone'), ref('module:new')], {
      keep: () => false,
    });
    expect(found.held).toEqual([ref('module:a')]);
    expect(found.universe.releases).toEqual([]);
  });

  it('queues a package not held with the manifest URL a client gave for it', async () => {
    const store = storeOf({});
    await gatherUniverse(store, [ref('module:new'), ref('module:other')], {
      hints: new Map([['module:new', 'https://example.com/new/module.json']]),
    });
    expect(store.requestCrawl).toHaveBeenCalledWith([
      { package: ref('module:new'), reason: 'request', manifest: 'https://example.com/new/module.json' },
      { package: ref('module:other'), reason: 'request' },
    ]);
  });
});
