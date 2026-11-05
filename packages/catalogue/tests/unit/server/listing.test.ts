import { describe, expect, it } from 'vitest';

import { coreOf, listingOf } from '../../../src/lib/server/listing.js';
import { mockStore } from '../support/store.js';

import type { ListedEntry } from '../../../src/lib/server/store/types.js';

const AT = new Date('2026-11-05T09:00:00.000Z');

const entry = (id: string, change: Partial<ListedEntry> = {}): ListedEntry => ({
  ref: { type: 'module', id },
  title: id.toUpperCase(),
  summary: null,
  author: null,
  url: null,
  tags: [],
  systems: [],
  premium: false,
  exclusive: false,
  latest: null,
  versions: [{ version: '1.0.0', minimum: '14', maximum: null, verified: '14.368', manifest: null, notes: null }],
  ...change,
});

/** An entry as the listing gives it. */
const listed = (given: ListedEntry) => ({
  package: given.ref,
  title: given.title,
  summary: given.summary,
  author: given.author,
  url: given.url,
  tags: given.tags,
  systems: given.systems,
  premium: given.premium,
  exclusive: given.exclusive,
  latest: given.latest,
  versions: given.versions,
});

describe('listingOf', () => {
  it('gives an ETag of the listing as it is, and its body, made once while it is the same', async () => {
    const store = mockStore();
    store.listingStamp.mockResolvedValue({ count: 2, changedAt: AT });
    store.listing.mockResolvedValue([entry('a'), entry('b', { title: null })]);
    const first = await listingOf(store, 'module');
    expect(first.etag).toBe(`"listing-module-2-${String(AT.getTime())}"`);
    expect(JSON.parse(await first.body())).toEqual({
      // A title the index does not give is the package's id.
      packages: [listed(entry('a')), { ...listed(entry('b')), title: 'b' }],
      asOf: AT.toISOString(),
    });
    await (await listingOf(store, 'module')).body();
    expect(store.listing).toHaveBeenCalledOnce();
  });

  it('makes it again once the listing changes, for each type apart', async () => {
    const store = mockStore();
    store.listingStamp.mockResolvedValueOnce({ count: 1, changedAt: AT });
    await (await listingOf(store, 'system')).body();
    store.listingStamp.mockResolvedValueOnce({ count: 2, changedAt: AT });
    const changed = await listingOf(store, 'system');
    expect(changed.etag).toBe(`"listing-system-2-${String(AT.getTime())}"`);
    await changed.body();
    const both = await listingOf(store, undefined);
    expect(both.etag).toBe('"listing-all-0-0"');
    expect(JSON.parse(await both.body())).toEqual({ packages: [], asOf: null });
    expect(store.listing.mock.calls).toEqual([['system'], ['system'], [undefined]]);
  });

  it('leaves out an entry the contract would refuse, rather than refusing the listing', async () => {
    const store = mockStore();
    store.listingStamp.mockResolvedValue({ count: 2, changedAt: new Date('2026-11-05T10:00:00.000Z') });
    store.listing.mockResolvedValue([
      entry('good'),
      entry('odd', {
        versions: [{ version: '', minimum: null, maximum: null, verified: null, manifest: null, notes: null }],
      }),
    ]);
    const { packages } = JSON.parse(await (await listingOf(store, 'module')).body()) as {
      packages: { title: string }[];
    };
    expect(packages.map(pkg => pkg.title)).toEqual(['GOOD']);
  });
});

describe('coreOf', () => {
  it("gives Foundry VTT's builds with an ETag of what they are", async () => {
    const store = mockStore();
    store.coreReleases.mockResolvedValue([{ version: '14.368', generation: 14, channel: 'stable' }]);
    const first = await coreOf(store);
    expect(JSON.parse(first.body)).toEqual({ core: [{ version: '14.368', generation: 14, channel: 'stable' }] });
    expect(first.etag).toMatch(/^"core-[0-9a-f]{16}"$/);
    expect((await coreOf(store)).etag).toBe(first.etag);
    store.coreReleases.mockResolvedValue([]);
    expect((await coreOf(store)).etag).not.toBe(first.etag);
  });
});
