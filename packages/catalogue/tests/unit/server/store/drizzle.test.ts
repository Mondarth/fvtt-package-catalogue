import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { crawlRequests, releases } from '../../../../src/lib/server/db/schema.js';
import { drizzleStore } from '../../../../src/lib/server/store/drizzle.js';
import { testDatabase } from '../../support/pglite.js';

import type { CoreRelease, Release, SourceGap } from '@mondarth/fvtt-package-catalogue-contract';
import type { Database } from '../../../../src/lib/server/db/database.js';
import type { CatalogueStore } from '../../../../src/lib/server/store/types.js';

const MIDI = { type: 'module', id: 'midi-qol' } as const;

const loaded: Release = {
  package: MIDI,
  version: '13.0.4',
  compatibility: { minimum: '13', maximum: '13', verified: '13.351' },
  relationships: {
    requires: [
      {
        package: { type: 'module', id: 'lib-wrapper' },
        compatibility: { minimum: '1.12.0' },
        manifest: 'https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json',
        reason: 'Patches core functions',
      },
      { package: { type: 'module', id: 'socketlib' }, compatibility: {} },
    ],
    systems: [{ package: { type: 'system', id: 'dnd5e' }, compatibility: { minimum: '4.0.0', verified: '5.1.0' } }],
    conflicts: [{ package: { type: 'module', id: 'better-rolls' }, compatibility: { maximum: '1.0.0' } }],
    recommends: [{ package: { type: 'module', id: 'dae' }, compatibility: {} }],
  },
  manifest: 'https://gitlab.com/tposney/midi-qol/raw/v13/package/module.json',
  download: 'https://gitlab.com/tposney/midi-qol/-/raw/v13/package/midi-qol-v13.0.4.zip',
  versionManifest: 'https://gitlab.com/tposney/midi-qol/-/raw/v13.0.4/package/module.json',
  protected: false,
  origin: 'https://gitlab.com/tposney/midi-qol/raw/v13/package/module.json',
  detail: 'loaded',
  listing: { minimum: '13', verified: '13' },
};

const listed: Release = {
  package: MIDI,
  version: '13.0.5',
  compatibility: {},
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  protected: true,
  origin: 'https://r2.foundryvtt.com/package-api-public/midi-qol.json',
  detail: 'listed',
  unlisted: true,
  loadFailed: true,
};

const at = new Date('2026-10-24T09:00:00.000Z');
const later = new Date('2026-10-24T10:00:00.000Z');

let store: CatalogueStore;
let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  store = drizzleStore(db);
});

afterEach(async () => {
  await close();
});

describe('drizzleStore', () => {
  it('answers a ping', async () => {
    await expect(store.ping()).resolves.toBeUndefined();
  });

  it('knows nothing at first', async () => {
    expect(await store.status()).toEqual({ packages: 0, releases: 0, asOf: null });
    expect(await store.releasesOf(MIDI)).toBeUndefined();
  });

  it('gives back the releases it saved, field for field', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [loaded, listed], asOf: at });
  });

  it('knows a package saved with no releases', async () => {
    await store.saveReleases(MIDI, [], { source: 'foundry-index', at });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [], asOf: at });
  });

  it('replaces a release of a version it holds, relationships and all, and keeps the others', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    const changed: Release = {
      ...loaded,
      compatibility: { minimum: '13' },
      relationships: { ...loaded.relationships, requires: [], conflicts: [] },
    };
    await store.saveReleases(MIDI, [changed], { source: 'gitlab', at: later });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [changed, listed], asOf: later });
  });

  // Regression: Drizzle's $onUpdate does not run for an upsert, so a replaced release kept its first time.
  it('records when a release last changed', async () => {
    await store.saveReleases(MIDI, [loaded], { source: 'foundry-index', at });
    const [first] = await db.select({ updatedAt: releases.updatedAt }).from(releases);
    await new Promise(resolve => setTimeout(resolve, 5));
    await store.saveReleases(MIDI, [loaded], { source: 'foundry-index', at: later });
    const [second] = await db.select({ updatedAt: releases.updatedAt }).from(releases);
    expect(second?.updatedAt.getTime()).toBeGreaterThan(first?.updatedAt.getTime() ?? Infinity);
  });

  it('keeps packages apart', async () => {
    const dnd5e = { type: 'system', id: 'dnd5e' } as const;
    await store.saveReleases(MIDI, [loaded], { source: 'foundry-index', at });
    await store.saveReleases(dnd5e, [{ ...listed, package: dnd5e }], { source: 'foundry-index', at: later });
    expect((await store.releasesOf(MIDI))?.releases).toEqual([loaded]);
    expect(await store.releasesOf({ type: 'world', id: 'midi-qol' })).toBeUndefined();
    expect(await store.status()).toEqual({ packages: 2, releases: 2, asOf: later });
  });

  it('refuses a release of another package, saving nothing', async () => {
    const stranger = { ...listed, package: { type: 'module', id: 'dae' } } as const;
    await expect(store.saveReleases(MIDI, [loaded, stranger], { source: 'x', at })).rejects.toThrow(
      'A release of module:dae is not of module:midi-qol',
    );
    expect(await store.status()).toEqual({ packages: 0, releases: 0, asOf: null });
  });
});

describe('drizzleStore, for universes', () => {
  const DND5E = { type: 'system', id: 'dnd5e' } as const;
  const dnd5eRelease: Release = { ...listed, package: DND5E, version: '5.1.0' };

  it('gives the releases of each package it knows, in the order asked, leaving out the others', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    await store.saveReleases(DND5E, [dnd5eRelease], { source: 'foundry-index', at: later });
    const found = await store.releasesOfEach([DND5E, { type: 'module', id: 'nobody' }, MIDI]);
    expect([...found.keys()]).toEqual(['system:dnd5e', 'module:midi-qol']);
    expect(found.get('module:midi-qol')).toEqual({ releases: [loaded, listed], asOf: at });
    expect(found.get('system:dnd5e')).toEqual({ releases: [dnd5eRelease], asOf: later });
  });

  it('gives nothing for no packages', async () => {
    expect((await store.releasesOfEach([])).size).toBe(0);
  });

  it("gives Foundry VTT's builds oldest first, by build number rather than text", async () => {
    const core: CoreRelease[] = [
      { version: '14.368', generation: 14, channel: 'stable' },
      { version: '13.351', generation: 13, channel: 'stable' },
      { version: '14.37', generation: 14, channel: 'testing' },
    ];
    await store.saveCoreReleases(core);
    expect(await store.coreReleases()).toEqual([core[1], core[2], core[0]]);
  });

  it('replaces a build it holds', async () => {
    await store.saveCoreReleases([{ version: '14.368', generation: 14, channel: 'testing' }]);
    await store.saveCoreReleases([{ version: '14.368', generation: 14, channel: 'stable' }]);
    await store.saveCoreReleases([]);
    expect(await store.coreReleases()).toEqual([{ version: '14.368', generation: 14, channel: 'stable' }]);
  });

  it('gives the gaps of the packages asked for, as recorded', async () => {
    const gaps: SourceGap[] = [
      {
        source: 'manifest',
        url: 'https://example.com/a.json',
        reason: 'http',
        status: 404,
        package: 'module:midi-qol',
        version: '13.0.5',
      },
      { source: 'github', url: 'https://api.github.com/x', reason: 'budget', package: 'module:dae' },
      { source: 'foundry-index', url: 'https://example.com/index', reason: 'network' },
    ];
    await store.recordGaps(gaps);
    await store.recordGaps([]);
    expect(await store.gapsOf(['module:midi-qol', 'module:dae'])).toEqual([gaps[0], gaps[1]]);
    expect(await store.gapsOf([])).toEqual([]);
  });

  it('queues each package once, as asked for if it ever was', async () => {
    await store.requestCrawl([
      { package: MIDI, reason: 'request' },
      { package: DND5E, reason: 'closure' },
    ]);
    await store.requestCrawl([{ package: MIDI, reason: 'closure' }]);
    await store.requestCrawl([]);
    expect(await queue()).toEqual([
      { type: 'module', packageId: 'midi-qol', reason: 'request' },
      { type: 'system', packageId: 'dnd5e', reason: 'closure' },
    ]);
    await store.requestCrawl([{ package: DND5E, reason: 'request' }]);
    expect(await queue()).toEqual([
      { type: 'module', packageId: 'midi-qol', reason: 'request' },
      { type: 'system', packageId: 'dnd5e', reason: 'request' },
    ]);
  });
});

/** The crawl queue, oldest first. */
function queue() {
  return db
    .select({ type: crawlRequests.type, packageId: crawlRequests.packageId, reason: crawlRequests.reason })
    .from(crawlRequests)
    .orderBy(crawlRequests.id);
}

describe('drizzleStore, for the worker', () => {
  const DND5E = { type: 'system', id: 'dnd5e' } as const;
  const DAE = { type: 'module', id: 'dae' } as const;
  // Requests are queued as of the database's clock, so the worker asks as of a little after it, at each test's time:
  // these tests are slow enough, under coverage, for a time taken once to fall behind.
  const soon = () => new Date(Date.now() + 60_000);

  it('gives the next package to crawl: asked for first, then needed, then due a refresh, oldest first', async () => {
    await store.requestCrawl([
      { package: DAE, reason: 'refresh' },
      { package: DND5E, reason: 'closure' },
    ]);
    await store.requestCrawl([{ package: MIDI, reason: 'request' }]);
    const order: string[] = [];
    for (let next = await store.nextCrawl(soon()); next !== undefined; next = await store.nextCrawl(soon())) {
      order.push(`${next.reason} ${next.package.type}:${next.package.id} ${String(next.attempts)}`);
      await store.finishCrawl(next.id);
    }
    expect(order).toEqual(['request module:midi-qol 0', 'closure system:dnd5e 0', 'refresh module:dae 0']);
  });

  it('gives nothing when the queue is empty', async () => {
    expect(await store.nextCrawl(soon())).toBeUndefined();
  });

  it('holds back a deferred package until its time, counting its failures', async () => {
    await store.requestCrawl([{ package: MIDI, reason: 'request' }]);
    const now = soon();
    const first = await store.nextCrawl(now);
    if (first === undefined) throw new Error('nothing queued');
    const until = new Date(now.getTime() + 60_000);
    await store.deferCrawl(first.id, until);
    expect(await store.nextCrawl(now)).toBeUndefined();
    expect(await store.nextCrawl(until)).toMatchObject({ id: first.id, attempts: 1 });
  });

  it("replaces a package's gaps, keeping other packages'", async () => {
    const old: SourceGap = { source: 'github', url: 'https://a', reason: 'network', package: 'module:midi-qol' };
    const other: SourceGap = { source: 'github', url: 'https://b', reason: 'network', package: 'module:dae' };
    const fresh: SourceGap = { source: 'manifest', url: 'https://c', reason: 'invalid', package: 'module:midi-qol' };
    await store.recordGaps([old, other]);
    await store.replaceGaps('module:midi-qol', [fresh]);
    expect(await store.gapsOf(['module:midi-qol', 'module:dae'])).toEqual([other, fresh]);
    await store.replaceGaps('module:midi-qol', []);
    expect(await store.gapsOf(['module:midi-qol'])).toEqual([]);
  });

  it('gives the manifest URLs relationships declare for a package, each once', async () => {
    const url = 'https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json';
    await store.saveReleases(MIDI, [loaded, { ...loaded, version: '13.0.3' }], { source: 'crawl', at });
    expect(await store.declaredManifests({ type: 'module', id: 'lib-wrapper' })).toEqual([url]);
    expect(await store.declaredManifests({ type: 'module', id: 'socketlib' })).toEqual([]);
  });

  it('says which packages it does not know', async () => {
    await store.saveReleases(MIDI, [], { source: 'crawl', at });
    expect(await store.unknownOf([DND5E, MIDI, DAE])).toEqual([DND5E, DAE]);
    expect(await store.unknownOf([])).toEqual([]);
  });

  it('records runs, and when a job last ended well', async () => {
    expect(await store.lastSuccess('core')).toBeNull();
    const failed = await store.startRun('core', at);
    await store.finishRun(failed, { at, outcome: 'failed', requests: 1, error: 'unreachable' });
    expect(await store.lastSuccess('core')).toBeNull();
    const ok = await store.startRun('core', at);
    await store.finishRun(ok, { at: later, outcome: 'ok', requests: 2 });
    const other = await store.startRun('crawl', at);
    await store.finishRun(other, { at: new Date('2026-10-25T00:00:00Z'), outcome: 'ok', requests: 3 });
    expect(await store.lastSuccess('core')).toEqual(later);
  });
});

describe('drizzleStore, for refreshing', () => {
  const DND5E = { type: 'system', id: 'dnd5e' } as const;

  it('gives every package it holds, with its sync time and listing details', async () => {
    await store.saveReleases(MIDI, [], { source: 'crawl', at });
    await store.saveReleases(DND5E, [], { source: 'crawl', at: later });
    expect(await store.heldPackages()).toEqual([
      { ref: MIDI, syncedAt: at, listingUpdatedAt: null, title: null, premium: false },
      { ref: DND5E, syncedAt: later, listingUpdatedAt: null, title: null, premium: false },
    ]);
  });

  it("saves the index's details of the packages it holds, and of no others", async () => {
    const day = new Date('2026-10-01T00:00:00.000Z');
    await store.saveReleases(MIDI, [], { source: 'crawl', at });
    await store.saveListings([
      { ref: MIDI, listingUpdatedAt: day, title: 'Midi QOL', premium: true },
      { ref: DND5E, listingUpdatedAt: day, title: 'D&D Fifth Edition', premium: false },
    ]);
    await store.saveListings([]);
    expect(await store.heldPackages()).toEqual([
      { ref: MIDI, syncedAt: at, listingUpdatedAt: day, title: 'Midi QOL', premium: true },
    ]);
  });
});
