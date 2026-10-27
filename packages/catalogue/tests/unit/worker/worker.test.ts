import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import { backoff, createWorker, sleep } from '../../../src/worker/worker.js';
import { memoryLogger } from '../support/logger.js';
import { mockStore } from '../support/store.js';

import type { CoreRelease, PackageRef, Release, UnavailableReason } from '@mondarth/fvtt-package-catalogue-contract';
import type { ReleaseSource, SourceResult } from '@mondarth/fvtt-resolver/sources';
import type { PackageOverrides } from '../../../src/lib/server/overrides.js';
import type { IndexEntry } from '../../../src/lib/server/refresh.js';
import type { QueuedCrawl } from '../../../src/lib/server/store/types.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const MIDI = { type: 'module', id: 'midi-qol' } as const;
const CORE: CoreRelease[] = [{ version: '14.368', generation: 14, channel: 'stable' }];

/** A loaded release of midi-qol, needing these packages. */
const release = (requires: PackageRef[] = []): Release => ({
  package: MIDI,
  version: '13.0.4',
  compatibility: { minimum: '13' },
  relationships: {
    requires: requires.map(ref => ({ package: ref, compatibility: {} })),
    systems: [],
    conflicts: [],
    recommends: [],
  },
  protected: false,
  origin: 'https://files.test/midi-qol/module.json',
  detail: 'loaded',
});

/** A source that knows these releases, or fails. */
const sourceOf = (found: () => Promise<SourceResult<Release[]>>): ReleaseSource => ({
  name: 'test',
  releases: found,
});

const queued = (overrides: Partial<QueuedCrawl> = {}): QueuedCrawl => ({
  id: 7,
  package: MIDI,
  reason: 'request',
  attempts: 0,
  ...overrides,
});

function setUp({
  releases = () => Promise.resolve<SourceResult<Release[]>>({ ok: true, value: [release()] }),
  core = () => Promise.resolve<SourceResult<CoreRelease[]>>({ ok: true, value: CORE }),
  index = () => Promise.resolve<SourceResult<IndexEntry[]>>({ ok: true, value: [] }),
  overrides,
}: {
  releases?: () => Promise<SourceResult<Release[]>>;
  core?: () => Promise<SourceResult<CoreRelease[]>>;
  index?: () => Promise<SourceResult<IndexEntry[]>>;
  overrides?: PackageOverrides;
} = {}) {
  const store = mockStore();
  const log = memoryLogger();
  const sleeps: number[] = [];
  const worker = createWorker({
    store,
    log,
    http: () => httpClient({ fetch: vi.fn<typeof fetch>() }),
    sources: () => [sourceOf(releases)],
    coreReleases: core,
    index,
    ...(overrides !== undefined && { overrides }),
    now: () => NOW,
    sleep: ms => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return { store, log, worker, sleeps };
}

describe('the worker, draining the queue', () => {
  it('crawls each package due, saving what it found and taking it off the queue', async () => {
    const { store, worker } = setUp();
    store.nextCrawl.mockResolvedValueOnce(queued());
    expect(await worker.drain()).toEqual({ crawled: 1 });
    expect(store.saveReleases).toHaveBeenCalledWith(MIDI, [release()], { source: 'crawl', at: NOW });
    expect(store.replaceGaps).toHaveBeenCalledWith('module:midi-qol', []);
    expect(store.finishCrawl).toHaveBeenCalledWith(7);
    expect(store.finishRun).toHaveBeenCalledWith(1, { at: NOW, outcome: 'ok', requests: 0 });
  });

  it('crawls with what the catalogue holds: the releases, the declared manifests and the builds', async () => {
    const releases = vi.fn(() => Promise.resolve<SourceResult<Release[]>>({ ok: true, value: [] }));
    const { store, worker } = setUp({ releases });
    store.nextCrawl.mockResolvedValueOnce(queued());
    store.declaredManifests.mockResolvedValue(['https://files.test/declared.json']);
    await worker.drain();
    expect(store.releasesOf).toHaveBeenCalledWith(MIDI);
    expect(store.declaredManifests).toHaveBeenCalledWith(MIDI);
    expect(releases).toHaveBeenCalled();
    // Saved with no releases, so that it is known and not queued again until it is due.
    expect(store.saveReleases).toHaveBeenCalledWith(MIDI, [], expect.anything());
  });

  it('queues what the releases need that the catalogue does not know, as the closure', async () => {
    const lib = { type: 'module', id: 'lib-wrapper' } as const;
    const socket = { type: 'module', id: 'socketlib' } as const;
    const { store, worker } = setUp({
      releases: () => Promise.resolve({ ok: true, value: [release([lib, socket])] }),
    });
    store.nextCrawl.mockResolvedValueOnce(queued());
    store.unknownOf.mockResolvedValue([socket]);
    await worker.drain();
    expect(store.unknownOf).toHaveBeenCalledWith([lib, socket]);
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: socket, reason: 'closure' }]);
  });

  it('leaves a package that failed on the queue, to try again later, and goes on', async () => {
    const { store, log, worker } = setUp();
    store.nextCrawl.mockResolvedValueOnce(queued({ attempts: 2 })).mockResolvedValueOnce(queued({ id: 8 }));
    store.saveReleases.mockRejectedValueOnce(new Error('disk full'));
    expect(await worker.drain()).toEqual({ crawled: 2 });
    expect(store.deferCrawl).toHaveBeenCalledWith(7, new Date(NOW.getTime() + backoff(2)));
    expect(store.finishCrawl).toHaveBeenCalledExactlyOnceWith(8);
    expect(store.finishRun).toHaveBeenCalledWith(1, { at: NOW, outcome: 'failed', requests: 0, error: 'disk full' });
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'The crawl failed', attempts: 3 }),
    );
  });

  it('records a failure that is not an Error by what was thrown', async () => {
    const { store, worker } = setUp();
    store.nextCrawl.mockResolvedValueOnce(queued());
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- what is being tested
    store.saveReleases.mockImplementationOnce(() => Promise.reject('gone'));
    await worker.drain();
    expect(store.finishRun).toHaveBeenCalledWith(1, expect.objectContaining({ error: 'gone' }));
  });
});

describe('the worker, with package overrides', () => {
  const day = (text: string) => new Date(`${text}T00:00:00.000Z`);
  const held = (ref: PackageRef, unavailable: UnavailableReason | null = null) => ({
    ref,
    syncedAt: day('2026-10-20'),
    listingUpdatedAt: null,
    title: null,
    premium: false,
    unavailable,
  });
  const overrides: PackageOverrides = {
    'module:midi-qol': { reason: 'Why', manifest: 'https://files.test/midi-qol/v{version}/module.json' },
    'module:not-held': { reason: 'Why', ignoreVersions: ['99.test'] },
  };

  it('queues the packages held that have overrides, once, when it starts, leaving those not held', async () => {
    const { store, log, worker } = setUp({ overrides });
    store.heldPackages.mockResolvedValue([held(MIDI), held({ type: 'module', id: 'lib-wrapper' })]);
    await worker.drain();
    await worker.drain();
    // The refresh queues what it finds besides: here, nothing.
    const queuedNow = store.requestCrawl.mock.calls.filter(([requests]) => requests.length > 0);
    expect(queuedNow).toEqual([[[{ package: MIDI, reason: 'refresh' }]]]);
    expect(log.lines).toContainEqual(
      expect.objectContaining({ message: 'The packages with overrides are queued', packages: 1 }),
    );
  });

  it('queues none when no package held has one', async () => {
    const { store, worker } = setUp({ overrides });
    store.heldPackages.mockResolvedValue([held({ type: 'module', id: 'lib-wrapper' })]);
    await worker.drain();
    expect(store.requestCrawl.mock.calls.filter(([requests]) => requests.length > 0)).toEqual([]);
  });

  it('tries again to queue them when the store could not say what it holds', async () => {
    const { store, worker } = setUp({ overrides });
    store.heldPackages.mockRejectedValueOnce(new Error('gone')).mockResolvedValue([held(MIDI)]);
    await expect(worker.drain()).rejects.toThrow('gone');
    await worker.drain();
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: MIDI, reason: 'refresh' }]);
  });

  it('queues a package held as gone that no override says is, so that it is crawled again', async () => {
    const lost = { type: 'module', id: 'lost' } as const;
    const { store, worker } = setUp();
    store.heldPackages.mockResolvedValue([held(lost, 'gone'), held(MIDI, 'archived')]);
    await worker.drain();
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: lost, reason: 'refresh' }]);
  });

  it('marks a package gone, as its override says, without crawling it, dropping its gaps', async () => {
    const releases = vi.fn(() => Promise.resolve<SourceResult<Release[]>>({ ok: true, value: [release()] }));
    const { store, worker } = setUp({
      releases,
      overrides: { 'module:midi-qol': { reason: 'Its repository was deleted', gone: true } },
    });
    store.nextCrawl.mockResolvedValueOnce(queued());
    await worker.drain();
    expect(store.saveUnavailable).toHaveBeenCalledWith(
      MIDI,
      { reason: 'gone', note: 'Its repository was deleted' },
      { source: 'crawl', at: NOW },
    );
    expect(store.replaceGaps).toHaveBeenCalledWith('module:midi-qol', []);
    expect(store.finishCrawl).toHaveBeenCalledWith(7);
    expect(releases).not.toHaveBeenCalled();
    expect(store.saveReleases).not.toHaveBeenCalled();
  });

  it('marks a package archived, as the index says, without crawling it', async () => {
    const archived: IndexEntry = { ref: MIDI, lastUpdated: null, title: null, premium: false, archived: true };
    const other: IndexEntry = { ...archived, ref: { type: 'module', id: 'other' } };
    const { store, worker } = setUp({ index: () => Promise.resolve({ ok: true, value: [other, archived] }) });
    store.nextCrawl.mockResolvedValueOnce(queued());
    await worker.drain();
    expect(store.saveUnavailable).toHaveBeenCalledWith(MIDI, { reason: 'archived' }, { source: 'crawl', at: NOW });
    expect(store.saveReleases).not.toHaveBeenCalled();
  });

  it('crawls a package with its override', async () => {
    const { store, worker } = setUp({ overrides });
    store.nextCrawl.mockResolvedValueOnce(queued());
    await worker.drain();
    expect(store.saveReleases).toHaveBeenCalledWith(
      MIDI,
      [{ ...release(), versionManifest: 'https://files.test/midi-qol/v13.0.4/module.json' }],
      expect.anything(),
    );
  });
});

describe("the worker, keeping Foundry VTT's builds", () => {
  it('fetches them when they never were', async () => {
    const { store, worker } = setUp();
    await worker.drain();
    expect(store.saveCoreReleases).toHaveBeenCalledWith(CORE);
    expect(store.startRun).toHaveBeenCalledWith('core', NOW);
  });

  it('does not fetch them again within a day', async () => {
    const { store, worker } = setUp();
    store.lastSuccess.mockResolvedValue(new Date(NOW.getTime() - 60 * 60 * 1000));
    await worker.drain();
    expect(store.saveCoreReleases).not.toHaveBeenCalled();
  });

  it('fetches them again after a day', async () => {
    const { store, worker } = setUp();
    store.lastSuccess.mockResolvedValue(new Date(NOW.getTime() - 25 * 60 * 60 * 1000));
    await worker.drain();
    expect(store.saveCoreReleases).toHaveBeenCalled();
  });

  it('keeps the builds it holds when they cannot be read, and goes on', async () => {
    const { store, log, worker } = setUp({
      core: () =>
        Promise.resolve({ ok: false, gap: { source: 'foundry-releases', url: 'https://x', reason: 'network' } }),
    });
    store.nextCrawl.mockResolvedValueOnce(queued());
    expect(await worker.drain()).toEqual({ crawled: 1 });
    expect(store.saveCoreReleases).not.toHaveBeenCalled();
    expect(store.finishRun).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        outcome: 'failed',
        error: "Foundry VTT's builds could not be read: network https://x",
      }),
    );
    expect(log.lines).toContainEqual(expect.objectContaining({ level: 'warn' }));
  });
});

describe('the worker, refreshing the packages held', () => {
  const day = (text: string) => new Date(`${text}T00:00:00.000Z`);
  const changed: IndexEntry = {
    ref: MIDI,
    lastUpdated: day('2026-10-22'),
    title: 'Midi QOL',
    premium: false,
    archived: false,
  };

  it("queues what Foundry VTT's index says changed, and keeps its details, before crawling", async () => {
    const { store, worker } = setUp({ index: () => Promise.resolve({ ok: true, value: [changed] }) });
    store.heldPackages.mockResolvedValue([
      {
        ref: MIDI,
        syncedAt: day('2026-10-20'),
        listingUpdatedAt: day('2026-10-01'),
        title: null,
        premium: false,
        unavailable: null,
      },
    ]);
    const order: string[] = [];
    store.requestCrawl.mockImplementation(() => {
      order.push('queued');
      return Promise.resolve();
    });
    store.nextCrawl.mockImplementation(() => {
      order.push('crawled');
      return Promise.resolve(undefined);
    });
    await worker.drain();
    expect(store.saveListings).toHaveBeenCalledWith([
      { ref: MIDI, listingUpdatedAt: day('2026-10-22'), title: 'Midi QOL', premium: false },
    ]);
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: MIDI, reason: 'refresh' }]);
    expect(order).toEqual(['queued', 'crawled']);
  });

  it('does not check again within an hour', async () => {
    const { store, worker } = setUp();
    store.lastSuccess.mockImplementation(job =>
      Promise.resolve(job === 'refresh' ? new Date(NOW.getTime() - 30 * 60 * 1000) : null),
    );
    await worker.drain();
    expect(store.saveListings).not.toHaveBeenCalled();
  });

  it('goes on to crawl when the index cannot be read', async () => {
    const { store, log, worker } = setUp({
      index: () => Promise.resolve({ ok: false, gap: { source: 'foundry-index', url: 'https://i', reason: 'http' } }),
    });
    store.nextCrawl.mockResolvedValueOnce(queued());
    expect(await worker.drain()).toEqual({ crawled: 1 });
    expect(store.saveListings).not.toHaveBeenCalled();
    // Not known to be archived, it is crawled.
    expect(store.saveReleases).toHaveBeenCalled();
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: 'warn', message: 'The packages held were not checked for changes' }),
    );
  });
});

describe('the worker, running', () => {
  it('waits when there is nothing to do, and stops when told', async () => {
    const { store, worker, sleeps } = setUp();
    const stop = new AbortController();
    store.nextCrawl.mockResolvedValueOnce(queued()).mockImplementation(() => {
      stop.abort();
      return Promise.resolve(undefined);
    });
    await worker.run(stop.signal);
    expect(store.finishCrawl).toHaveBeenCalledWith(7);
    // Straight on after a crawl; a wait only once the queue is empty.
    expect(sleeps).toEqual([5000]);
  });

  it('waits and tries again when the store cannot be reached', async () => {
    const { store, log, worker, sleeps } = setUp();
    const stop = new AbortController();
    store.lastSuccess.mockImplementation(() => {
      stop.abort();
      return Promise.reject(new Error('connection refused'));
    });
    await worker.run(stop.signal);
    expect(sleeps).toEqual([5000]);
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'The worker could not reach the store' }),
    );
  });
});

describe('the worker, by default', () => {
  it('takes the time from the clock, and waits with sleep', async () => {
    const store = mockStore();
    const stop = new AbortController();
    store.nextCrawl.mockImplementation(at => {
      stop.abort();
      expect(Math.abs(at.getTime() - Date.now())).toBeLessThan(5000);
      return Promise.resolve(undefined);
    });
    const worker = createWorker({
      store,
      log: memoryLogger(),
      http: () => httpClient({ fetch: vi.fn<typeof fetch>() }),
      sources: () => [],
      coreReleases: () => Promise.resolve({ ok: true, value: [] }),
      index: () => Promise.resolve({ ok: true, value: [] }),
    });
    // Stopped already, the default sleep returns at once rather than after five seconds.
    await worker.run(stop.signal);
    expect(store.nextCrawl).toHaveBeenCalledOnce();
  });
});

describe('backoff', () => {
  it('doubles from a minute, to a day at most', () => {
    expect([0, 1, 2, 20].map(backoff)).toEqual([60_000, 120_000, 240_000, 24 * 60 * 60 * 1000]);
  });
});

describe('sleep', () => {
  it('waits as long as it is asked', async () => {
    vi.useFakeTimers();
    try {
      let woke = false;
      const waiting = sleep(1000, new AbortController().signal).then(() => (woke = true));
      await vi.advanceTimersByTimeAsync(999);
      expect(woke).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(woke).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression: a listener added after the abort never heard it, so a stop between jobs waited out the whole poll.
  it('does not wait at all when the signal has aborted already', async () => {
    vi.useFakeTimers();
    try {
      const stop = new AbortController();
      stop.abort();
      let woke = false;
      void sleep(60_000, stop.signal).then(() => (woke = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(woke).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops waiting when the signal aborts', async () => {
    const stop = new AbortController();
    const waiting = sleep(60_000, stop.signal);
    stop.abort();
    await expect(waiting).resolves.toBeUndefined();
  });
});
