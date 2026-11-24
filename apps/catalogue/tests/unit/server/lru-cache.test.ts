import { describe, expect, it } from 'vitest';

import { lruCache, versionsOnly } from '../../../src/lib/server/lru-cache.js';

const entry = (value: string) => ({ value, storedAt: 0 });

describe('lruCache', () => {
  it('gives back what was set, and nothing for what was not', async () => {
    const cache = lruCache(2);
    await cache.set('a', entry('one'));
    expect(await cache.get('a')).toEqual(entry('one'));
    expect(await cache.get('b')).toBeUndefined();
  });

  it('keeps at most so many, letting go of the least recently used', async () => {
    const cache = lruCache(2);
    await cache.set('a', entry('one'));
    await cache.set('b', entry('two'));
    // Used, so b is now the least recent.
    await cache.get('a');
    await cache.set('c', entry('three'));
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toEqual(entry('one'));
    expect(await cache.get('c')).toEqual(entry('three'));
  });

  it('replaces an entry set again, as the most recent', async () => {
    const cache = lruCache(2);
    await cache.set('a', entry('one'));
    await cache.set('b', entry('two'));
    await cache.set('a', entry('again'));
    await cache.set('c', entry('three'));
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toEqual(entry('again'));
  });
});

describe('versionsOnly', () => {
  it("keeps only each manifest's version, with its ETag", async () => {
    const cache = versionsOnly(lruCache(5));
    await cache.set('a', {
      value: { id: 'midi-qol', version: '14.0.20', description: 'long' },
      etag: '"v1"',
      storedAt: 1,
    });
    await cache.set('b', { value: 'not a manifest', storedAt: 2 });
    await cache.set('c', { value: null, storedAt: 3 });
    expect(await cache.get('a')).toEqual({ value: { version: '14.0.20' }, etag: '"v1"', storedAt: 1 });
    expect(await cache.get('b')).toEqual({ value: { version: undefined }, storedAt: 2 });
    expect(await cache.get('c')).toEqual({ value: { version: undefined }, storedAt: 3 });
  });
});
