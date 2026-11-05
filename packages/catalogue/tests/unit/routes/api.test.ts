import { describe, expect, it, vi } from 'vitest';

import manifest from '../../../package.json';

import { GET as releases } from '../../../src/routes/api/v1/packages/[type=packageType]/[id]/releases/+server.js';
import { GET as status } from '../../../src/routes/api/v1/status/+server.js';
import { POST as universe } from '../../../src/routes/api/v1/universe/+server.js';
import { GET as core } from '../../../src/routes/api/v2/core/+server.js';
import { GET as listing } from '../../../src/routes/api/v2/listing/+server.js';
import { POST as lookup } from '../../../src/routes/api/v2/lookup/+server.js';
import { POST as manifestRead } from '../../../src/routes/api/v2/manifest/+server.js';
import { POST as recheck } from '../../../src/routes/api/v2/recheck/+server.js';
import { GET as health } from '../../../src/routes/healthz/+server.js';
import { invoke } from '../support/event.js';
import { mockStore } from '../support/store.js';

import type { Release } from '@mondarth/fvtt-package-catalogue-contract';

const release: Release = {
  package: { type: 'module', id: 'midi-qol' },
  version: '13.0.4',
  compatibility: {},
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  protected: false,
  origin: 'https://example.com/module.json',
  detail: 'listed',
};

describe('GET /api/v1/packages/:type/:id/releases', () => {
  const get = (id: string, store = mockStore()) =>
    invoke(releases, { params: { type: 'module', id }, locals: { store } });

  it("gives a package's releases, as of when they were fetched", async () => {
    const store = mockStore();
    store.releasesOf.mockResolvedValue({
      releases: [release],
      asOf: new Date('2026-10-24T09:00:00Z'),
      unavailable: null,
    });
    const response = await get('midi-qol', store);
    expect(store.releasesOf).toHaveBeenCalledWith({ type: 'module', id: 'midi-qol' });
    expect(await response.json()).toEqual({
      package: { type: 'module', id: 'midi-qol' },
      releases: [release],
      asOf: '2026-10-24T09:00:00.000Z',
    });
  });

  it('gives releases never brought up to date as of no time', async () => {
    const store = mockStore();
    store.releasesOf.mockResolvedValue({ releases: [], asOf: null, unavailable: null });
    expect(await (await get('midi-qol', store)).json()).toMatchObject({ asOf: null });
  });

  it('answers not-found for a package it does not know', async () => {
    const response = await get('nobody');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not-found', requestId: 'request-1' } });
  });

  it('answers bad-request for an id no package can have, without asking the store', async () => {
    const store = mockStore();
    const response = await get('a/b', store);
    expect(response.status).toBe(400);
    expect(store.releasesOf).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/universe', () => {
  const post = (body: unknown, store = mockStore()) =>
    invoke(universe, {
      method: 'POST',
      url: 'http://catalogue.test/api/v1/universe',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      locals: { store },
    });

  it('gives the universe of the packages asked for, and what it does not hold yet', async () => {
    const store = mockStore();
    store.releasesOfEach.mockResolvedValue(
      new Map([
        ['module:midi-qol', { releases: [release], asOf: new Date('2026-10-24T09:00:00Z'), unavailable: null }],
      ]),
    );
    const response = await post({ packages: [release.package, { type: 'module', id: 'nobody' }] }, store);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      universe: { core: [], releases: [release] },
      gaps: [],
      pending: [{ type: 'module', id: 'nobody' }],
      unavailable: [],
      asOf: '2026-10-24T09:00:00.000Z',
    });
  });

  it('is as of no time when it holds nothing', async () => {
    expect(await (await post({ packages: [release.package] })).json()).toMatchObject({ asOf: null });
  });

  it.each([
    ['a body that is not JSON', '{'],
    ['no packages', { packages: [] }],
    ['an id no package can have', { packages: [{ type: 'module', id: 'a/b' }] }],
    ['a type that is not one', { packages: [{ type: 'scene', id: 'a' }] }],
  ])('answers bad-request for %s, without asking the store', async (_, body) => {
    const store = mockStore();
    const response = await post(body, store);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'bad-request', requestId: 'request-1' } });
    expect(store.releasesOfEach).not.toHaveBeenCalled();
  });

  it('says what is wrong with the request', async () => {
    const response = await post({ packages: [] });
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain('packages');
  });
});

describe('POST /api/v2/lookup', () => {
  const post = (body: unknown, store = mockStore()) =>
    invoke(lookup, {
      method: 'POST',
      url: 'http://catalogue.test/api/v2/lookup',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      locals: { store },
    });

  it('gives each package once with its releases, and what it does not hold yet', async () => {
    const store = mockStore();
    const asOf = new Date('2026-10-24T09:00:00Z');
    store.releasesOfEach.mockResolvedValue(
      new Map([['module:midi-qol', { releases: [release], asOf, unavailable: null }]]),
    );
    const response = await post(
      {
        packages: [
          { ...release.package, installed: release.version },
          { type: 'module', id: 'nobody' },
        ],
      },
      store,
    );
    expect(response.status).toBe(200);
    const { package: ref, ...given } = release;
    expect(await response.json()).toEqual({
      core: [],
      packages: [
        {
          package: ref,
          title: null,
          latest: null,
          premium: false,
          syncedAt: null,
          own: { version: null, readAt: null, checkedAt: null },
          releases: [given],
        },
      ],
      pending: [{ package: { type: 'module', id: 'nobody' }, retryAfter: 30 }],
      unavailable: [],
      unreached: [],
      asOf: '2026-10-24T09:00:00.000Z',
    });
  });

  it.each([
    ['a body that is not JSON', '{'],
    ['no packages', { packages: [] }],
    ['a manifest that is not a URL', { packages: [{ type: 'module', id: 'a', manifest: 'module.json' }] }],
    ['a generation that is not one', { packages: [{ type: 'module', id: 'a' }], fromGeneration: 0 }],
  ])('answers bad-request for %s, without asking the store', async (_, body) => {
    const store = mockStore();
    const response = await post(body, store);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'bad-request' } });
    expect(store.releasesOfEach).not.toHaveBeenCalled();
  });
});

describe('GET /api/v2/listing', () => {
  const get = (query: string, store = mockStore(), headers: Record<string, string> = {}) =>
    invoke(listing, { url: `http://catalogue.test/api/v2/listing${query}`, headers, locals: { store } });

  it('gives the listing of the type asked for, with an ETag, and 304 to a client that has it', async () => {
    const store = mockStore();
    store.listingStamp.mockResolvedValue({ count: 0, changedAt: new Date('2026-11-05T08:00:00Z') });
    const response = await get('?type=system', store);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ packages: [], asOf: '2026-11-05T08:00:00.000Z' });
    expect(store.listingStamp).toHaveBeenCalledWith('system');
    const etag = response.headers.get('ETag') ?? '';
    expect((await get('?type=system', store, { 'If-None-Match': etag })).status).toBe(304);
  });

  it('gives both types when none is asked for', async () => {
    const store = mockStore();
    await get('', store);
    expect(store.listingStamp).toHaveBeenCalledWith(undefined);
  });

  it('answers bad-request for a type the listing does not offer', async () => {
    const store = mockStore();
    const response = await get('?type=world', store);
    expect(response.status).toBe(400);
    expect(store.listingStamp).not.toHaveBeenCalled();
  });
});

describe('GET /api/v2/core', () => {
  it("gives Foundry VTT's builds with an ETag, and 304 to a client that has them", async () => {
    const store = mockStore();
    store.coreReleases.mockResolvedValue([{ version: '14.368', generation: 14, channel: 'stable' }]);
    const response = await invoke(core, { url: 'http://catalogue.test/api/v2/core', locals: { store } });
    expect(await response.json()).toEqual({ core: [{ version: '14.368', generation: 14, channel: 'stable' }] });
    const again = await invoke(core, {
      url: 'http://catalogue.test/api/v2/core',
      headers: { 'If-None-Match': response.headers.get('ETag') ?? '' },
      locals: { store },
    });
    expect(again.status).toBe(304);
  });
});

describe('POST /api/v2/recheck', () => {
  const post = (body: unknown, store = mockStore()) =>
    invoke(recheck, {
      method: 'POST',
      url: 'http://catalogue.test/api/v2/recheck',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      locals: { store },
    });

  it('gives each package held as rechecked, and leaves out those it does not hold', async () => {
    const store = mockStore();
    const asOf = new Date('2026-11-05T09:00:00Z');
    // Held, with no manifest of its own to read, so nothing is fetched.
    store.releasesOfEach.mockResolvedValue(
      new Map([
        [
          'module:midi-qol',
          { releases: [{ ...release, manifest: undefined } as unknown as Release], asOf, unavailable: null },
        ],
      ]),
    );
    const response = await post({ packages: [release.package, { type: 'module', id: 'nobody' }] }, store);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      packages: [{ package: release.package, own: { version: null, readAt: null, checkedAt: null }, changed: false }],
      pending: [],
    });
    expect(store.saveOwnChecks).toHaveBeenCalledWith(
      [{ ref: release.package, outcome: 'none', changed: false }],
      expect.any(Date),
    );
  });

  it.each([
    ['a body that is not JSON', '{'],
    ['no packages', { packages: [] }],
    ['too many packages', { packages: Array.from({ length: 51 }, () => release.package) }],
  ])('answers bad-request for %s, without asking the store', async (_, body) => {
    const store = mockStore();
    const response = await post(body, store);
    expect(response.status).toBe(400);
    expect(store.detailsOf).not.toHaveBeenCalled();
  });
});

describe('POST /api/v2/manifest', () => {
  const post = (body: unknown, locals: Partial<App.Locals> = {}) =>
    invoke(manifestRead, {
      method: 'POST',
      url: 'http://catalogue.test/api/v2/manifest',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      locals,
    });

  it('reads the manifest URL given, as the server fetches it', async () => {
    const fetchGiven = vi.fn(() =>
      Promise.resolve({
        ok: true,
        url: 'https://example.com/module.json',
        body: '{"id":"a","version":"1.0.0"}',
      } as const),
    );
    const response = await post({ url: 'https://example.com/module.json', type: 'module' }, { fetchGiven });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, title: 'a', release: { version: '1.0.0' } });
    expect(fetchGiven).toHaveBeenCalledWith('https://example.com/module.json');
  });

  it.each([
    ['a body that is not JSON', '{'],
    ['a URL that is not of the web', { url: 'file:///etc/passwd', type: 'module' }],
    ['a type that is not installed from a manifest', { url: 'https://example.com/world.json', type: 'world' }],
  ])('answers bad-request for %s, without fetching', async (_, body) => {
    const fetchGiven = vi.fn();
    const response = await post(body, { fetchGiven });
    expect(response.status).toBe(400);
    expect(fetchGiven).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/status', () => {
  it('gives what the catalogue holds, and its version', async () => {
    const store = mockStore();
    store.status.mockResolvedValue({
      packages: 3,
      releases: 40,
      asOf: new Date('2026-10-24T09:00:00Z'),
      consistency: null,
    });
    const response = await invoke(status, { locals: { store } });
    expect(await response.json()).toEqual({
      apiVersion: 'v1',
      // The build's version, from package.json, which every release changes: never a copy of it.
      version: manifest.version,
      packages: 3,
      releases: 40,
      asOf: '2026-10-24T09:00:00.000Z',
      consistency: null,
    });
  });

  it('gives how the catalogue last compared with the index', async () => {
    const store = mockStore();
    const consistency = {
      at: '2026-11-05T03:00:00.000Z',
      listed: 3,
      held: 2,
      versionsMissing: 1,
      latestMissing: 0,
      listingsDiffer: 0,
      archivedHeld: 0,
      ownMissing: 0,
      requeued: 1,
    };
    store.status.mockResolvedValue({ packages: 2, releases: 5, asOf: null, consistency });
    expect(await (await invoke(status, { locals: { store } })).json()).toMatchObject({ consistency });
  });

  it('gives no time when nothing was ever brought up to date', async () => {
    expect(await (await invoke(status)).json()).toMatchObject({ asOf: null });
  });
});

describe('GET /healthz', () => {
  it('says the server is up, never cached', async () => {
    const response = await invoke(health);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
