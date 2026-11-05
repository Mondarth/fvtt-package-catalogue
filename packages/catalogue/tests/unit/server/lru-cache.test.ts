import { describe, expect, it } from 'vitest';

import { lruCache } from '../../../src/lib/server/lru-cache.js';

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
