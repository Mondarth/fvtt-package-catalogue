/**
 * The worker's cache of what it fetched: in memory, for the process, but bounded. Crawls keep every manifest they read
 * for as long as they may (`maxAge: Infinity`), and warming crawls the whole of Foundry VTT's index, so a cache that
 * kept everything would grow with every package crawled until the worker stopped. What matters most, such as the
 * index, is used every few minutes, so it stays; a manifest read once and not again goes.
 */
import type { Cache, CacheEntry } from '@mondarth/fvtt-resolver/sources';

/**
 * A cache that keeps, of each manifest set in it, only its version, with the ETag to revalidate it by: all that a check
 * of a package's own manifest reads. A few hundred bytes each, so it can hold every package's, and an unchanged
 * manifest costs its server only a `304`, however many crawls passed through the worker's cache in the hour between.
 *
 * @param cache - The cache to keep them in
 * @returns The cache
 */
export function versionsOnly(cache: Cache): Cache {
  return {
    get: key => cache.get(key),
    set: (key, entry) => {
      const version: unknown =
        typeof entry.value === 'object' && entry.value !== null ? Reflect.get(entry.value, 'version') : undefined;
      return cache.set(key, { ...entry, value: { version } });
    },
  };
}

/**
 * A cache in memory that keeps at most `maxEntries` entries, letting go of the least recently used first.
 *
 * @param maxEntries - How many it keeps
 * @returns The cache
 */
export function lruCache(maxEntries: number): Cache {
  // A Map keeps its keys in the order they were set: an entry used is set again, so the first is the least recent.
  const entries = new Map<string, CacheEntry>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (entry !== undefined) {
        entries.delete(key);
        entries.set(key, entry);
      }
      return Promise.resolve(entry);
    },
    set(key, entry) {
      entries.delete(key);
      entries.set(key, entry);
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) break;
        entries.delete(oldest);
      }
      return Promise.resolve();
    },
  };
}
