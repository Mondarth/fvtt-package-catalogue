import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../../../src/lib/server/db/schema.js';
import { crawlRequests, listings, packages, releases } from '../../../../src/lib/server/db/schema.js';
import { drizzleStore } from '../../../../src/lib/server/store/drizzle.js';
import { NO_DETAILS } from '../../support/index-entry.js';
import { testDatabase } from '../../support/pglite.js';

import type { CoreRelease, Release, SourceGap } from '@mondarth/fvtt-package-catalogue-contract';
import type { Database } from '../../../../src/lib/server/db/database.js';
import type { IndexEntry } from '../../../../src/lib/server/refresh.js';
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
    expect(await store.status()).toEqual({ packages: 0, releases: 0, asOf: null, consistency: null });
    expect(await store.releasesOf(MIDI)).toBeUndefined();
  });

  it('gives back the releases it saved, field for field', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [loaded, listed], asOf: at, unavailable: null });
  });

  it('knows a package saved with no releases', async () => {
    await store.saveReleases(MIDI, [], { source: 'foundry-index', at });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [], asOf: at, unavailable: null });
  });

  it('replaces a release of a version it holds, relationships and all, and keeps the others', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    const changed: Release = {
      ...loaded,
      compatibility: { minimum: '13' },
      relationships: { ...loaded.relationships, requires: [], conflicts: [] },
    };
    await store.saveReleases(MIDI, [changed], { source: 'gitlab', at: later });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [changed, listed], asOf: later, unavailable: null });
  });

  it('removes the versions it is told to, relationships and all, and only of that package', async () => {
    const dnd5e = { type: 'system', id: 'dnd5e' } as const;
    await store.saveReleases(MIDI, [loaded, listed], { source: 'foundry-index', at });
    await store.saveReleases(dnd5e, [{ ...listed, package: dnd5e }], { source: 'foundry-index', at });

    await store.saveReleases(MIDI, [], { source: 'crawl', at: later, remove: [listed.version, 'not-held'] });

    expect(await store.releasesOf(MIDI)).toEqual({ releases: [loaded], asOf: later, unavailable: null });
    expect((await store.releasesOf(dnd5e))?.releases).toEqual([{ ...listed, package: dnd5e }]);
    // A version removed and given again is saved anew.
    await store.saveReleases(MIDI, [listed], { source: 'crawl', at: later, remove: [listed.version] });
    expect((await store.releasesOf(MIDI))?.releases).toEqual([loaded, listed]);
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
    expect(await store.status()).toEqual({ packages: 2, releases: 2, asOf: later, consistency: null });
  });

  it('refuses a release of another package, saving nothing', async () => {
    const stranger = { ...listed, package: { type: 'module', id: 'dae' } } as const;
    await expect(store.saveReleases(MIDI, [loaded, stranger], { source: 'x', at })).rejects.toThrow(
      'A release of module:dae is not of module:midi-qol',
    );
    expect(await store.status()).toEqual({ packages: 0, releases: 0, asOf: null, consistency: null });
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
    expect(found.get('module:midi-qol')).toEqual({ releases: [loaded, listed], asOf: at, unavailable: null });
    expect(found.get('system:dnd5e')).toEqual({ releases: [dnd5eRelease], asOf: later, unavailable: null });
  });

  it('gives a package that cannot be had with none of the releases it held, and why', async () => {
    await store.saveReleases(MIDI, [loaded, listed], { source: 'crawl', at });
    await store.saveUnavailable(
      MIDI,
      { reason: 'gone', note: 'Its repository was deleted' },
      { source: 'crawl', at: later },
    );
    await store.saveUnavailable(DND5E, { reason: 'archived' }, { source: 'crawl', at });
    const found = await store.releasesOfEach([MIDI, DND5E]);
    expect(found.get('module:midi-qol')).toEqual({
      releases: [],
      asOf: later,
      unavailable: { reason: 'gone', note: 'Its repository was deleted' },
    });
    expect(found.get('system:dnd5e')).toEqual({ releases: [], asOf: at, unavailable: { reason: 'archived' } });
    expect(await store.declaredManifests({ type: 'module', id: 'lib-wrapper' })).toEqual([]);
  });

  it('makes a package available again when its releases are saved', async () => {
    await store.saveUnavailable(MIDI, { reason: 'archived' }, { source: 'crawl', at });
    await store.saveReleases(MIDI, [listed], { source: 'crawl', at: later });
    expect(await store.releasesOf(MIDI)).toEqual({ releases: [listed], asOf: later, unavailable: null });
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

  it('queues a package for the most pressing reason it was queued for', async () => {
    await store.requestCrawl([
      { package: MIDI, reason: 'warm' },
      { package: DND5E, reason: 'refresh' },
    ]);
    await store.requestCrawl([
      { package: MIDI, reason: 'closure' },
      { package: DND5E, reason: 'warm' },
    ]);
    expect(await queue()).toEqual([
      { type: 'module', packageId: 'midi-qol', reason: 'closure' },
      { type: 'system', packageId: 'dnd5e', reason: 'refresh' },
    ]);
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

  it('gives the next package to crawl: asked for first, then needed, then due a refresh, then to warm', async () => {
    await store.requestCrawl([
      { package: { type: 'module', id: 'socketlib' }, reason: 'warm' },
      { package: DAE, reason: 'refresh' },
      { package: DND5E, reason: 'closure' },
    ]);
    await store.requestCrawl([{ package: MIDI, reason: 'request' }]);
    const order: string[] = [];
    for (let next = await store.nextCrawl(soon()); next !== undefined; next = await store.nextCrawl(soon())) {
      order.push(`${next.reason} ${next.package.type}:${next.package.id} ${String(next.attempts)}`);
      await store.finishCrawl(next.id);
    }
    expect(order).toEqual([
      'request module:midi-qol 0',
      'closure system:dnd5e 0',
      'refresh module:dae 0',
      'warm module:socketlib 0',
    ]);
  });

  it('gives no package to warm when told not to', async () => {
    await store.requestCrawl([
      { package: DAE, reason: 'warm' },
      { package: DND5E, reason: 'refresh' },
    ]);
    expect(await store.nextCrawl(soon(), { warm: false })).toMatchObject({ package: DND5E });
    expect(await store.nextCrawl(soon(), { warm: false })).toBeUndefined();
    expect(await store.nextCrawl(soon())).toMatchObject({ package: DAE, reason: 'warm' });
  });

  it('holds a package taken from other crawls for an hour, unless it is finished first', async () => {
    await store.requestCrawl([
      { package: MIDI, reason: 'request' },
      { package: DAE, reason: 'request' },
    ]);
    const now = soon();
    const first = await store.nextCrawl(now);
    const second = await store.nextCrawl(now);
    expect([first?.package, second?.package]).toEqual([MIDI, DAE]);
    expect(await store.nextCrawl(now)).toBeUndefined();
    if (second === undefined) throw new Error('nothing queued');
    await store.finishCrawl(second.id);
    // Never finished, as when the worker stopped mid-crawl: given again once the hour is over.
    const hourOn = new Date(now.getTime() + 60 * 60 * 1000);
    expect(await store.nextCrawl(new Date(hourOn.getTime() - 1))).toBeUndefined();
    expect(await store.nextCrawl(hourOn)).toMatchObject({ package: MIDI, attempts: 0 });
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
      { ref: MIDI, syncedAt: at, listingUpdatedAt: null, title: null, premium: false, unavailable: null },
      { ref: DND5E, syncedAt: later, listingUpdatedAt: null, title: null, premium: false, unavailable: null },
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
      { ref: MIDI, syncedAt: at, listingUpdatedAt: day, title: 'Midi QOL', premium: true, unavailable: null },
    ]);
  });
});

describe("drizzleStore, for checking packages' own manifests", () => {
  const DAE = { type: 'module', id: 'dae' } as const;
  const DND5E = { type: 'system', id: 'dnd5e' } as const;
  const own = () =>
    db
      .select({
        packageId: packages.packageId,
        ownVersion: packages.ownVersion,
        ownCheckedAt: packages.ownCheckedAt,
        ownReadAt: packages.ownReadAt,
      })
      .from(packages)
      .orderBy(packages.id);

  it('gives those due: never checked first, then the least recently checked, of the available, at most so many', async () => {
    for (const ref of [MIDI, DAE, DND5E]) await store.saveReleases(ref, [], { source: 'crawl', at });
    await store.saveUnavailable({ type: 'module', id: 'gone' }, { reason: 'gone' }, { source: 'crawl', at });
    await store.saveOwnChecks([{ ref: MIDI, outcome: 'none', changed: false }], later);
    await store.saveOwnChecks([{ ref: DAE, outcome: 'none', changed: false }], at);
    expect(await store.ownChecksDue(new Date(later.getTime() + 1), 10)).toEqual([DND5E, DAE, MIDI]);
    expect(await store.ownChecksDue(later, 10)).toEqual([DND5E, DAE]);
    expect(await store.ownChecksDue(later, 1)).toEqual([DND5E]);
  });

  it('keeps what each check found: the version read, none, or what was last read when it fails', async () => {
    for (const ref of [MIDI, DAE, DND5E]) await store.saveReleases(ref, [], { source: 'crawl', at });
    await store.saveOwnChecks(
      [
        { ref: MIDI, outcome: 'read', version: '13.0.5', changed: true },
        { ref: DAE, outcome: 'read', version: '1.0.0', changed: false },
      ],
      at,
    );
    await store.saveOwnChecks(
      [
        { ref: DAE, outcome: 'failed', changed: false },
        { ref: DND5E, outcome: 'none', changed: false },
      ],
      later,
    );
    await store.saveOwnChecks([], later);
    expect(await own()).toEqual([
      { packageId: 'midi-qol', ownVersion: '13.0.5', ownCheckedAt: at, ownReadAt: at },
      { packageId: 'dae', ownVersion: '1.0.0', ownCheckedAt: later, ownReadAt: at },
      { packageId: 'dnd5e', ownVersion: null, ownCheckedAt: later, ownReadAt: null },
    ]);
  });
});

describe('drizzleStore, for consistency checks', () => {
  const report = (at: Date, held: number) => ({
    at: at.toISOString(),
    listed: 3,
    held,
    versionsMissing: 1,
    latestMissing: 0,
    listingsDiffer: 2,
    archivedHeld: 0,
    ownMissing: 1,
    requeued: 2,
  });

  it('gives the latest report with the status', async () => {
    await store.saveConsistency(report(at, 1));
    await store.saveConsistency(report(later, 2));
    expect((await store.status()).consistency).toEqual(report(later, 2));
  });

  it("gives the index's copy, delisted entries and worlds left out, and every package held with its releases", async () => {
    const versions = [
      { version: '13.0.4', minimum: '13', maximum: null, verified: '13.351', manifest: null, notes: null },
    ];
    const entry = (id: string, change: Partial<IndexEntry> = {}): IndexEntry => ({
      ref: { type: 'module', id },
      lastUpdated: at,
      title: id,
      premium: false,
      archived: false,
      details: NO_DETAILS,
      ...change,
    });
    await store.saveIndex(
      [
        entry('midi-qol', { details: { ...NO_DETAILS, latestVersion: '13.0.4', versions } }),
        entry('old', { details: { ...NO_DETAILS, status: 'archived' } }),
        entry('world', { ref: { type: 'world', id: 'world' } }),
        entry('delisted'),
      ],
      at,
    );
    await store.saveIndex(
      [
        entry('midi-qol', { details: { ...NO_DETAILS, latestVersion: '13.0.4', versions } }),
        entry('old', { details: { ...NO_DETAILS, status: 'archived' } }),
        entry('world', { ref: { type: 'world', id: 'world' } }),
      ],
      later,
    );
    await store.saveReleases(MIDI, [loaded, listed], { source: 'crawl', at });
    await store.saveOwnChecks([{ ref: MIDI, outcome: 'read', version: '13.0.6', changed: true }], at);
    await store.saveUnavailable({ type: 'module', id: 'gone' }, { reason: 'gone' }, { source: 'crawl', at });

    expect(await store.consistencyInputs()).toEqual({
      indexed: [
        { ref: MIDI, archived: false, latestVersion: '13.0.4', versions },
        { ref: { type: 'module', id: 'old' }, archived: true, latestVersion: null, versions: [] },
      ],
      held: [
        {
          ref: MIDI,
          unavailable: null,
          ownVersion: '13.0.6',
          releases: [{ version: '13.0.4', listing: { minimum: '13', verified: '13' } }, { version: '13.0.5' }],
        },
        { ref: { type: 'module', id: 'gone' }, unavailable: 'gone', ownVersion: null, releases: [] },
      ],
    });
  });
});

describe("drizzleStore, keeping Foundry VTT's index", () => {
  const entry = (id: string, change: Partial<IndexEntry> = {}): IndexEntry => ({
    ref: { type: 'module', id },
    lastUpdated: at,
    title: id,
    premium: false,
    archived: false,
    details: NO_DETAILS,
    ...change,
  });
  const kept = () =>
    db
      .select({
        packageId: listings.packageId,
        title: listings.title,
        delistedAt: listings.delistedAt,
        updatedAt: listings.updatedAt,
      })
      .from(listings)
      .orderBy(listings.packageId);

  it('keeps every entry, held or not, with what its listing shows', async () => {
    const details = {
      ...NO_DETAILS,
      summary: 'Automation',
      author: { name: 'tim posney', username: 'tim-posney' },
      provider: { id: 'pelgrane', name: 'Pelgrane Press' },
      url: 'https://github.com/tposney/midi-qol',
      marketplaceUrl: 'https://store.test/midi',
      tags: ['combat'],
      systems: ['dnd5e'],
      exclusive: true,
      status: 'approved',
      latestVersion: '14.0.20',
      versions: [
        { version: '14.0.20', minimum: '14.368', maximum: '14.999', verified: '14.368', manifest: null, notes: null },
      ],
    };
    expect(await store.saveIndex([entry('midi-qol', { premium: true, details }), entry('dae')], at)).toEqual({
      added: 2,
      changed: 0,
      delisted: 0,
    });
    const [midi] = await db
      .select()
      .from(listings)
      .where(sql`${listings.packageId} = 'midi-qol'`);
    expect(midi).toMatchObject({
      type: 'module',
      title: 'midi-qol',
      summary: 'Automation',
      authorName: 'tim posney',
      authorUsername: 'tim-posney',
      providerId: 'pelgrane',
      providerName: 'Pelgrane Press',
      url: 'https://github.com/tposney/midi-qol',
      marketplaceUrl: 'https://store.test/midi',
      tags: ['combat'],
      systems: ['dnd5e'],
      premium: true,
      exclusive: true,
      status: 'approved',
      lastUpdated: at,
      latestVersion: '14.0.20',
      versions: details.versions,
      delistedAt: null,
      updatedAt: at,
    });
    expect(await store.heldPackages()).toEqual([]);
  });

  it('writes only the entries that changed', async () => {
    await store.saveIndex([entry('midi-qol'), entry('dae')], at);
    expect(await store.saveIndex([entry('midi-qol', { title: 'Midi QOL' }), entry('dae')], later)).toEqual({
      added: 0,
      changed: 1,
      delisted: 0,
    });
    expect(await kept()).toEqual([
      { packageId: 'dae', title: 'dae', delistedAt: null, updatedAt: at },
      { packageId: 'midi-qol', title: 'Midi QOL', delistedAt: null, updatedAt: later },
    ]);
  });

  it('marks an entry the index no longer lists delisted, and not when it is listed again', async () => {
    await store.saveIndex([entry('midi-qol'), entry('dae'), entry('socketlib')], at);
    expect(await store.saveIndex([entry('midi-qol'), entry('dae')], later)).toEqual({
      added: 0,
      changed: 0,
      delisted: 1,
    });
    expect((await kept()).find(row => row.packageId === 'socketlib')).toMatchObject({ delistedAt: later });
    // Delisted once: not again.
    expect(await store.saveIndex([entry('midi-qol'), entry('dae')], later)).toMatchObject({ delisted: 0 });

    const again = new Date('2026-10-24T11:00:00.000Z');
    expect(await store.saveIndex([entry('midi-qol'), entry('dae'), entry('socketlib')], again)).toEqual({
      added: 0,
      changed: 1,
      delisted: 0,
    });
    expect((await kept()).find(row => row.packageId === 'socketlib')).toMatchObject({
      delistedAt: null,
      updatedAt: again,
    });
  });

  it('delists none when the index lists fewer than half the entries kept', async () => {
    await store.saveIndex([entry('a'), entry('b'), entry('c'), entry('d'), entry('e')], at);
    expect(await store.saveIndex([entry('a'), entry('b')], later)).toEqual({ added: 0, changed: 0, delisted: 0 });
    expect(await store.saveIndex([], later)).toMatchObject({ delisted: 0 });
    expect((await kept()).every(row => row.delistedAt === null)).toBe(true);
  });

  it('tells apart packages of two types with one id', async () => {
    await store.saveIndex([entry('dnd5e'), entry('dnd5e', { ref: { type: 'system', id: 'dnd5e' } })], at);
    expect(await kept()).toHaveLength(2);
  });

  it('gives the packages to warm: listed, not archived, not held and not queued, the most recently changed first', async () => {
    const day = (text: string) => new Date(`${text}T00:00:00.000Z`);
    const index = [
      entry('old', { lastUpdated: day('2026-01-01') }),
      entry('new', { lastUpdated: day('2026-10-01') }),
      entry('undated', { lastUpdated: null }),
      entry('archived', { details: { ...NO_DETAILS, status: 'archived' } }),
      entry('approved', { lastUpdated: day('2026-05-01'), details: { ...NO_DETAILS, status: 'approved' } }),
      entry('held'),
      entry('queued'),
      entry('world', { ref: { type: 'world', id: 'world' } }),
    ];
    await store.saveIndex([...index, entry('delisted')], at);
    await store.saveIndex(index, later);
    await store.saveReleases({ type: 'module', id: 'held' }, [], { source: 'crawl', at });
    await store.requestCrawl([{ package: { type: 'module', id: 'queued' }, reason: 'request' }]);
    expect((await store.unwarmed()).map(ref => ref.id)).toEqual(['new', 'approved', 'old', 'undated']);
  });

  it('writes the entries of a large index in batches', async () => {
    const many = Array.from({ length: 1201 }, (_, index) => entry(`pkg-${String(index)}`));
    expect(await store.saveIndex(many, at)).toMatchObject({ added: 1201 });
    expect(await kept()).toHaveLength(1201);
  });
});

describe('the migration that keeps unlisted releases', () => {
  it('queues every package held for one crawl, keeping why a queued one was asked for', async () => {
    const MIGRATION = '0002_recrawl-for-unlisted';
    // The migrations before it, applied to a catalogue holding packages, then it.
    const source = new URL('../../../../drizzle', import.meta.url).pathname;
    const before = mkdtempSync(join(tmpdir(), 'migrations-'));
    try {
      cpSync(source, before, { recursive: true });
      const journal = JSON.parse(readFileSync(join(before, 'meta/_journal.json'), 'utf8')) as {
        entries: { tag: string }[];
      };
      journal.entries = journal.entries.slice(
        0,
        journal.entries.findIndex(entry => entry.tag === MIGRATION),
      );
      writeFileSync(join(before, 'meta/_journal.json'), JSON.stringify(journal));

      const client = new PGlite();
      const old = drizzle({ client, schema, casing: 'snake_case' });
      await migrate(old, { migrationsFolder: before });
      // Written as that schema had them: today's store writes columns later migrations add.
      await old.execute(
        sql`insert into packages (type, package_id, synced_at) values ('module', 'midi-qol', ${at.toISOString()}), ('system', 'dnd5e', ${at.toISOString()})`,
      );
      await drizzleStore(old).requestCrawl([{ package: MIDI, reason: 'request' }]);

      await migrate(old, { migrationsFolder: source });
      const queued = await old
        .select({ type: crawlRequests.type, packageId: crawlRequests.packageId, reason: crawlRequests.reason })
        .from(crawlRequests)
        .orderBy(crawlRequests.id);
      expect(queued).toEqual([
        { type: 'module', packageId: 'midi-qol', reason: 'request' },
        { type: 'system', packageId: 'dnd5e', reason: 'refresh' },
      ]);
      await client.close();
    } finally {
      rmSync(before, { recursive: true, force: true });
    }
  });
});
