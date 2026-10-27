import { describe, expect, it } from 'vitest';

import manifest from '../../../package.json';

import { GET as releases } from '../../../src/routes/api/v1/packages/[type=packageType]/[id]/releases/+server.js';
import { GET as status } from '../../../src/routes/api/v1/status/+server.js';
import { POST as universe } from '../../../src/routes/api/v1/universe/+server.js';
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

describe('GET /api/v1/status', () => {
  it('gives what the catalogue holds, and its version', async () => {
    const store = mockStore();
    store.status.mockResolvedValue({ packages: 3, releases: 40, asOf: new Date('2026-10-24T09:00:00Z') });
    const response = await invoke(status, { locals: { store } });
    expect(await response.json()).toEqual({
      apiVersion: 'v1',
      // The build's version, from package.json, which every release changes: never a copy of it.
      version: manifest.version,
      packages: 3,
      releases: 40,
      asOf: '2026-10-24T09:00:00.000Z',
    });
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
