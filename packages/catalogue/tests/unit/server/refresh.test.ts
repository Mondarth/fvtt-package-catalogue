import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import {
  fetchIndex,
  manifestChanges,
  manifestCheckDue,
  ownManifest,
  planRefresh,
  readIndex,
} from '../../../src/lib/server/refresh.js';
import { NO_DETAILS } from '../support/index-entry.js';

import type { Release } from '@mondarth/fvtt-package-catalogue-contract';
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
  details: NO_DETAILS,
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
      {
        ref: { type: 'system', id: 'pf2e' },
        lastUpdated: null,
        title: null,
        premium: true,
        archived: true,
        details: { ...NO_DETAILS, status: 'archived' },
      },
    ]);
  });

  it('reads what its listing shows, as the index gives it', () => {
    const [read] =
      readIndex({
        packages: [
          {
            id: 'midi-qol',
            type: 'module',
            title: 'Midi QOL',
            summary: 'Automation',
            author: { name: 'tim posney', username: 'tim-posney' },
            provider: { id: 'pelgrane', name: 'Pelgrane Press' },
            url: 'https://github.com/tposney/midi-qol',
            marketplace_url: 'https://store.test/midi',
            tags: ['combat', 7],
            requires: ['dnd5e'],
            exclusive: true,
            status: 'approved',
            latest_version: 14,
            compatibility: [
              {
                from: '14.368',
                to: '14.999',
                verified: 14.368,
                version: '14.0.20',
                manifest: 'https://files.test/14.0.20/module.json',
                notes: 'https://files.test/notes',
              },
              { from: '13', to: null, verified: null, version: '13.0.4', manifest: null, notes: null },
              { from: '12', notes: 'no version' },
            ],
          },
        ],
      }) ?? [];
    expect(read?.details).toEqual({
      summary: 'Automation',
      author: { name: 'tim posney', username: 'tim-posney' },
      provider: { id: 'pelgrane', name: 'Pelgrane Press' },
      url: 'https://github.com/tposney/midi-qol',
      marketplaceUrl: 'https://store.test/midi',
      tags: ['combat'],
      systems: ['dnd5e'],
      exclusive: true,
      status: 'approved',
      latestVersion: '14',
      versions: [
        {
          version: '14.0.20',
          minimum: '14.368',
          maximum: '14.999',
          verified: '14.368',
          manifest: 'https://files.test/14.0.20/module.json',
          notes: 'https://files.test/notes',
        },
        { version: '13.0.4', minimum: '13', maximum: null, verified: null, manifest: null, notes: null },
      ],
    });
  });

  it('reads an entry with a field of another shape, leaving that field out', () => {
    // Foundry VTT's own index gives many entries a null author; an entry of another shape leaves the index readable.
    const [read] =
      readIndex({
        packages: [
          {
            id: 'odd',
            type: 'module',
            title: null,
            author: { username: 'no-name' },
            tags: 'combat',
            premium: 'yes',
            compatibility: { version: '1.0.0' },
          },
        ],
      }) ?? [];
    expect(read).toEqual({
      ref: { type: 'module', id: 'odd' },
      lastUpdated: null,
      title: null,
      premium: false,
      archived: false,
      details: NO_DETAILS,
    });
  });

  it('reads an author with no username', () => {
    const [read] = readIndex({ packages: [{ id: 'a', type: 'module', author: { name: 'Ann' } }] }) ?? [];
    expect(read?.details.author).toEqual({ name: 'Ann', username: null });
  });

  it('reads the time it last changed, as the index gives it now', () => {
    // Foundry VTT's index gave only the day until 2026; since then, every entry gives the time, so none read as undated.
    const read = readIndex({
      packages: [
        { id: 'a', type: 'module', last_updated: '2026-11-02T12:04:25Z' },
        { id: 'b', type: 'module', last_updated: '2026-11-02T12:04:25.808402+00:00' },
        { id: 'c', type: 'module', last_updated: '2026-11-02T14:04:25+02:00' },
      ],
    });
    expect(read?.map(e => e.lastUpdated)).toEqual([
      new Date('2026-11-02T12:04:25.000Z'),
      new Date('2026-11-02T12:04:25.808Z'),
      new Date('2026-11-02T12:04:25.000Z'),
    ]);
  });

  it('gives no time for one that is neither a day nor a time', () => {
    const read = readIndex({
      packages: [
        { id: 'a', type: 'module', last_updated: 'yesterday' },
        { id: 'b', type: 'module', last_updated: '2026-13-45' },
        { id: 'c', type: 'module', last_updated: null },
        { id: 'd', type: 'module', last_updated: '2026-11-02T12:04:25' },
        { id: 'e', type: 'module', last_updated: '2026-13-02T12:04:25Z' },
      ],
    });
    expect(read?.map(e => e.lastUpdated)).toEqual([null, null, null, null, null]);
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
  it('crawls it again once it was synced a week ago, though the index says it has not changed', () => {
    // Its own manifest may give a version the index does not, leaving the index's day as it was.
    expect(plan([held({ syncedAt: new Date(NOW.getTime() - WEEK) })], [entry()]).refresh).toEqual([MIDI]);
  });

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

  it('crawls it again when the index says it changed later the same day, as it gives the time', () => {
    const before = held({ listingUpdatedAt: new Date('2026-10-22T09:00:00.000Z') });
    const changed = entry({ lastUpdated: new Date('2026-10-22T15:30:00.000Z') });
    expect(plan([before], [changed]).refresh).toEqual([MIDI]);
    expect(plan([before], [entry({ lastUpdated: before.listingUpdatedAt })])).toEqual({ refresh: [], listings: [] });
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

describe("a package's own manifest", () => {
  const MANIFEST = 'https://files.test/midi-qol/module.json';
  const release = (version: string, change: Partial<Release> = {}): Release => ({
    package: MIDI,
    version,
    compatibility: { minimum: '14' },
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: MANIFEST,
    detail: 'loaded',
    manifest: MANIFEST,
    ...change,
  });

  it('is checked once a day for each package, a 24th of them each hour', () => {
    const refs = Array.from(
      { length: 200 },
      (_, index) => ({ type: 'module', id: `module-${String(index)}` }) as const,
    );
    const hours = Array.from({ length: 24 }, (_, hour) => new Date(Date.UTC(2026, 9, 24, hour, 30)));
    for (const ref of refs) expect(hours.filter(hour => manifestCheckDue(ref, hour))).toHaveLength(1);
    const busiest = Math.max(...hours.map(hour => refs.filter(ref => manifestCheckDue(ref, hour)).length));
    expect(busiest).toBeLessThan(30);
  });

  it("is the newest listed release's, or else the newest's, unless it names that release's version", () => {
    expect(
      ownManifest([
        release('1.0.0', { manifest: 'https://files.test/midi-qol/1.0.0.json' }),
        release('2.0.0', { manifest: 'https://files.test/midi-qol/latest.json' }),
        release('3.0.0', { unlisted: true, manifest: 'https://gitlab.test/v3.0.0/module.json' }),
      ]),
    ).toBe('https://files.test/midi-qol/latest.json');
    // A manifest of one version's own never gives a newer.
    expect(
      ownManifest([release('1.0.0'), release('2.0.0', { manifest: 'https://files.test/midi-qol/2.0.0.json' })]),
    ).toBeUndefined();
    expect(ownManifest([release('3.0.0', { unlisted: true })])).toBe(MANIFEST);
    expect(ownManifest([{ ...release('1.0.0'), manifest: undefined } as unknown as Release])).toBeUndefined();
  });

  it('queues a package whose manifest gives a version not held, and none whose does not, or cannot be read', async () => {
    const answers: Record<string, () => Response> = {
      [MANIFEST]: () => Response.json({ id: 'midi-qol', version: '1.0.36' }),
      'https://files.test/same/module.json': () => Response.json({ id: 'same', version: 'v1.0.0' }),
      'https://files.test/odd/module.json': () => Response.json({ id: 'odd' }),
      'https://files.test/gone/module.json': () => new Response('', { status: 404 }),
    };
    const http = httpClient({
      fetch: vi.fn<typeof fetch>(input => {
        const url = input instanceof Request ? input.url : input.toString();
        return Promise.resolve((answers[url] ?? (() => new Response('', { status: 404 })))());
      }),
    });
    const of = (id: string) => ({ type: 'module', id }) as const;
    const at = (id: string) => [release('1.0.0', { manifest: `https://files.test/${id}/module.json` })];

    const changed = await manifestChanges(http, [
      { ref: MIDI, releases: [release('1.0.35')] },
      { ref: of('same'), releases: at('same') },
      { ref: of('odd'), releases: at('odd') },
      { ref: of('gone'), releases: at('gone') },
      { ref: of('none'), releases: [] },
    ]);

    expect(changed).toEqual([MIDI]);
  });
});
