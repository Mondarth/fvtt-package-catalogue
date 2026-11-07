import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';
import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import { recheck } from '../../../src/lib/server/recheck.js';
import { mockStore } from '../support/store.js';

import type { PackageRef, Release } from '@mondarth/fvtt-package-catalogue-contract';
import type { PackageDetails } from '../../../src/lib/server/store/types.js';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const MINUTE = 60 * 1000;
const ref = (id: string) => ({ type: 'module', id }) as const;
const manifestOf = (id: string) => `https://files.test/${id}/module.json`;

const release = (of: PackageRef, version: string): Release => ({
  package: of,
  version,
  compatibility: {},
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  manifest: manifestOf(of.id),
  protected: false,
  origin: manifestOf(of.id),
  detail: 'loaded',
});

const details = (change: Partial<PackageDetails> = {}): PackageDetails => ({
  title: null,
  latest: null,
  premium: false,
  syncedAt: NOW,
  ownVersion: null,
  ownReadAt: null,
  ownCheckedAt: null,
  ...change,
});

/** A store holding these packages, each at 1.0.0, with these details, which keeps the checks saved. */
/** A package held with no releases, crawled last at a time, or never. */
interface Empty {
  readonly empty: Date | null;
}

function storeOf(held: Record<string, Partial<PackageDetails> | 'gone' | Empty>) {
  const store = mockStore();
  const known = new Map(Object.entries(held));
  store.releasesOfEach.mockImplementation(refs =>
    Promise.resolve(
      new Map(
        refs.flatMap(of => {
          const found = known.get(packageKey(of));
          if (found === undefined) return [];
          return [
            [
              packageKey(of),
              found === 'gone'
                ? { releases: [], asOf: NOW, unavailable: { reason: 'gone' as const } }
                : 'empty' in found
                  ? { releases: [], asOf: found.empty, unavailable: null }
                  : { releases: [release(of, '1.0.0')], asOf: NOW, unavailable: null },
            ] as const,
          ];
        }),
      ),
    ),
  );
  const saved = new Map<string, PackageDetails>();
  store.saveOwnChecks.mockImplementation((checks, at) => {
    for (const check of checks) {
      const was = known.get(packageKey(check.ref));
      saved.set(packageKey(check.ref), {
        ...details(was === 'gone' || (was !== undefined && 'empty' in was) ? {} : was),
        ownCheckedAt: at,
        ...(check.outcome === 'read' && { ownVersion: check.version, ownReadAt: at }),
      });
    }
    return Promise.resolve();
  });
  store.detailsOf.mockImplementation(refs =>
    Promise.resolve(
      new Map(
        refs.flatMap(of => {
          const key = packageKey(of);
          const found = saved.get(key) ?? known.get(key);
          if (found === undefined || found === 'gone') return [];
          return [[key, { ...details(), ...('empty' in found ? {} : found) }] as const];
        }),
      ),
    ),
  );
  return store;
}

const serving = (versions: Record<string, string>) => {
  const fetch = vi.fn<typeof globalThis.fetch>(input => {
    const url = input instanceof Request ? input.url : String(input);
    const id = /files\.test\/([^/]+)\//.exec(url)?.[1] ?? '';
    const version = versions[id];
    return Promise.resolve(version === undefined ? new Response('', { status: 404 }) : Response.json({ version }));
  });
  return { fetch, http: httpClient({ fetch }) };
};

describe('recheck', () => {
  it('checks each package held now, keeps what it found, and queues those that give a version not held', async () => {
    const store = storeOf({ 'module:newer': {}, 'module:same': {} });
    const { http } = serving({ newer: '1.0.1', same: '1.0.0' });
    const found = await recheck(store, [ref('newer'), ref('same'), ref('newer')], { http, now: NOW });
    expect(found).toEqual({
      packages: [
        {
          package: ref('newer'),
          own: { version: '1.0.1', readAt: NOW.toISOString(), checkedAt: NOW.toISOString() },
          changed: true,
        },
        {
          package: ref('same'),
          own: { version: '1.0.0', readAt: NOW.toISOString(), checkedAt: NOW.toISOString() },
          changed: false,
        },
      ],
      pending: [{ package: ref('newer'), retryAfter: 30 }],
    });
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: ref('newer'), reason: 'request' }]);
  });

  it('gives one checked in the last five minutes as it was, without fetching it', async () => {
    const recently = new Date(NOW.getTime() - 4 * MINUTE);
    const store = storeOf({
      'module:recent': { ownVersion: '1.0.0', ownReadAt: recently, ownCheckedAt: recently },
      'module:older': { ownVersion: '1.0.0', ownReadAt: recently, ownCheckedAt: new Date(NOW.getTime() - 5 * MINUTE) },
    });
    const { fetch, http } = serving({ recent: '9.9.9', older: '1.0.0' });
    const found = await recheck(store, [ref('recent'), ref('older')], { http, now: NOW });
    expect(found.packages[0]).toEqual({
      package: ref('recent'),
      own: { version: '1.0.0', readAt: recently.toISOString(), checkedAt: recently.toISOString() },
      changed: false,
    });
    expect(found.packages[1]?.own.checkedAt).toBe(NOW.toISOString());
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('leaves out packages it does not hold, or that cannot be had, and fetches nothing when none is due', async () => {
    const store = storeOf({ 'module:gone': 'gone' });
    const { fetch, http } = serving({});
    expect(await recheck(store, [ref('nobody'), ref('gone')], { http, now: NOW })).toEqual({
      packages: [],
      pending: [],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.requestCrawl).not.toHaveBeenCalled();
    expect(store.detailsOf).toHaveBeenCalledOnce();
  });

  it('keeps what was last read when the manifest cannot be read', async () => {
    const before = new Date(NOW.getTime() - 60 * MINUTE);
    const store = storeOf({ 'module:broken': { ownVersion: '1.0.0', ownReadAt: before, ownCheckedAt: before } });
    const { http } = serving({});
    const found = await recheck(store, [ref('broken')], { http, now: NOW });
    expect(found.packages).toEqual([
      {
        package: ref('broken'),
        own: { version: '1.0.0', readAt: before.toISOString(), checkedAt: NOW.toISOString() },
        changed: false,
      },
    ]);
  });

  // Regression: a package held with no releases has no manifest of its own to check, so a check live found nothing new
  // of it, and nothing had it crawled again.
  it('queues a package held with no releases that is due to be crawled again, as pending', async () => {
    const store = storeOf({
      'module:emma': { empty: new Date(NOW.getTime() - 2 * 60 * MINUTE) },
      'module:fresh': { empty: new Date(NOW.getTime() - 10 * MINUTE) },
    });
    const { http } = serving({});
    const answer = await recheck(store, [ref('emma'), ref('fresh')], { http, now: NOW });
    expect(store.requestCrawl).toHaveBeenCalledExactlyOnceWith([{ package: ref('emma'), reason: 'request' }]);
    expect(answer.pending).toEqual([{ package: ref('emma'), retryAfter: expect.any(Number) as number }]);
    expect(answer.packages.map(({ package: of, changed }) => [of.id, changed])).toEqual([
      ['emma', true],
      ['fresh', false],
    ]);
  });
});
