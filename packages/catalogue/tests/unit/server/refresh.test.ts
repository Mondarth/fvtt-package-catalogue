import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import { fetchIndex, planRefresh, readIndex } from '../../../src/lib/server/refresh.js';

import type { HeldPackage, IndexEntry } from '../../../src/lib/server/refresh.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const MIDI = { type: 'module', id: 'midi-qol' } as const;

const held = (overrides: Partial<HeldPackage> = {}): HeldPackage => ({
  ref: MIDI,
  syncedAt: new Date('2026-10-20T10:00:00.000Z'),
  listingUpdatedAt: new Date('2026-10-01T00:00:00.000Z'),
  title: 'Midi QOL',
  premium: false,
  unavailable: null,
  ...overrides,
});

const entry = (overrides: Partial<IndexEntry> = {}): IndexEntry => ({
  ref: MIDI,
  lastUpdated: new Date('2026-10-01T00:00:00.000Z'),
  title: 'Midi QOL',
  premium: false,
  archived: false,
  ...overrides,
});

const plan = (packages: HeldPackage[], index: IndexEntry[]) =>
  planRefresh(packages, index, { now: NOW, staleMs: WEEK });

describe('readIndex', () => {
  it("reads each package's type, id, title, premium and the day it last changed", () => {
    expect(
      readIndex({
        details: 'https://x/{id}.json',
        packages: [
          { id: 'midi-qol', type: 'module', title: 'Midi QOL', last_updated: '2026-10-01', premium: false, extra: 1 },
          { id: 'pf2e', type: 'system', premium: true, status: 'archived' },
        ],
      }),
    ).toEqual([
      entry(),
      { ref: { type: 'system', id: 'pf2e' }, lastUpdated: null, title: null, premium: true, archived: true },
    ]);
  });

  it('gives no day for one that is not a day', () => {
    const read = readIndex({
      packages: [
        { id: 'a', type: 'module', last_updated: 'yesterday' },
        { id: 'b', type: 'module', last_updated: '2026-13-45' },
        { id: 'c', type: 'module', last_updated: null },
      ],
    });
    expect(read?.map(e => e.lastUpdated)).toEqual([null, null, null]);
  });

  it('leaves out a type of package the catalogue does not know', () => {
    expect(readIndex({ packages: [{ id: 'x', type: 'theme' }] })).toEqual([]);
  });

  it('gives nothing for what is not an index', () => {
    expect(readIndex({ items: [] })).toBeUndefined();
  });
});

describe('fetchIndex', () => {
  const URL = 'https://index.test/index-latest.json';
  const serving = (response: () => Response) =>
    httpClient({ fetch: vi.fn<typeof fetch>(() => Promise.resolve(response())) });

  it('reads the index fetched', async () => {
    const http = serving(() =>
      Response.json({ packages: [{ id: 'midi-qol', type: 'module', last_updated: '2026-10-01', title: 'Midi QOL' }] }),
    );
    expect(await fetchIndex(http, URL)).toEqual({ ok: true, value: [entry()] });
  });

  it('gives the gap when it cannot be fetched', async () => {
    const http = serving(() => new Response('', { status: 404 }));
    expect(await fetchIndex(http, URL)).toEqual({
      ok: false,
      gap: { source: 'foundry-index', url: URL, reason: 'http', status: 404 },
    });
  });

  it('gives an invalid gap when what was fetched is not an index', async () => {
    const http = serving(() => Response.json({ nothing: true }));
    expect(await fetchIndex(http, URL)).toEqual({
      ok: false,
      gap: { source: 'foundry-index', url: URL, reason: 'invalid' },
    });
  });
});

describe('planRefresh, for a package on the index', () => {
  it('leaves it be while the index says it has not changed', () => {
    expect(plan([held()], [entry()])).toEqual({ refresh: [], listings: [] });
  });

  it('crawls it again when the index archives it, or no longer does, though its day has not changed', () => {
    expect(plan([held()], [entry({ archived: true })]).refresh).toEqual([MIDI]);
    expect(plan([held({ unavailable: 'archived' })], [entry()]).refresh).toEqual([MIDI]);
    expect(plan([held({ unavailable: 'archived' })], [entry({ archived: true })]).refresh).toEqual([]);
  });

  it('leaves a package gone be, whatever the index says of it', () => {
    expect(plan([held({ unavailable: 'gone' })], [entry({ archived: true })]).refresh).toEqual([]);
    expect(plan([held({ unavailable: 'gone' })], [entry()]).refresh).toEqual([]);
  });

  it('crawls it again when the index says it changed, and keeps the new day', () => {
    const changed = entry({ lastUpdated: new Date('2026-10-22T00:00:00.000Z') });
    expect(plan([held()], [changed])).toEqual({
      refresh: [MIDI],
      listings: [{ ref: MIDI, listingUpdatedAt: changed.lastUpdated, title: 'Midi QOL', premium: false }],
    });
  });

  describe('read for the first time', () => {
    const first = held({ listingUpdatedAt: null, title: null });

    it('crawls it again if it changed on or after the day it was synced', () => {
      expect(plan([first], [entry({ lastUpdated: new Date('2026-10-20T00:00:00.000Z') })]).refresh).toEqual([MIDI]);
    });

    it('does not if it changed before, keeping the day all the same', () => {
      expect(plan([first], [entry({ lastUpdated: new Date('2026-10-19T00:00:00.000Z') })])).toEqual({
        refresh: [],
        listings: [
          { ref: MIDI, listingUpdatedAt: new Date('2026-10-19T00:00:00.000Z'), title: 'Midi QOL', premium: false },
        ],
      });
    });
  });

  it('keeps its details when only they changed', () => {
    expect(plan([held()], [entry({ title: 'Midi-QOL', premium: true })])).toEqual({
      refresh: [],
      listings: [{ ref: MIDI, listingUpdatedAt: entry().lastUpdated, title: 'Midi-QOL', premium: true }],
    });
  });

  it('crawls it if it was never synced', () => {
    expect(plan([held({ syncedAt: null })], [entry()]).refresh).toEqual([MIDI]);
  });

  it('treats it as off the index when the index gives no day', () => {
    const undated = entry({ lastUpdated: null });
    expect(plan([held({ listingUpdatedAt: null })], [undated]).refresh).toEqual([]);
    expect(
      plan([held({ listingUpdatedAt: null, syncedAt: new Date(NOW.getTime() - WEEK) })], [undated]).refresh,
    ).toEqual([MIDI]);
  });
});

describe('planRefresh, for a package off the index', () => {
  it('crawls it again once it was synced a week ago, and not before', () => {
    const weekOld = held({ syncedAt: new Date(NOW.getTime() - WEEK) });
    const younger = held({ syncedAt: new Date(NOW.getTime() - WEEK + 1) });
    expect(plan([weekOld], []).refresh).toEqual([MIDI]);
    expect(plan([younger], [])).toEqual({ refresh: [], listings: [] });
  });

  it('crawls it if it was never synced', () => {
    expect(plan([held({ syncedAt: null })], []).refresh).toEqual([MIDI]);
  });

  it('is told apart from a package of another type with its id', () => {
    expect(plan([held()], [entry({ ref: { type: 'system', id: 'midi-qol' }, lastUpdated: NOW })])).toEqual({
      refresh: [],
      listings: [],
    });
  });
});
