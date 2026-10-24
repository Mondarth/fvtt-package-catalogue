import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { releases } from '../../../../src/lib/server/db/schema.js';
import { drizzleStore } from '../../../../src/lib/server/store/drizzle.js';
import { testDatabase } from '../../support/pglite.js';

import type { Release } from '@mondarth/fvtt-package-catalogue-contract';
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
