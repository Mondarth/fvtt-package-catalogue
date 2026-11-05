import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import { backoff, createWorker, sleep } from '../../../src/worker/worker.js';
import { NO_DETAILS } from '../support/index-entry.js';
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
const sourceOf = (found: ReleaseSource['releases']): ReleaseSource => ({
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
  send = vi.fn<typeof globalThis.fetch>(),
  warmPerHour,
  crawlConcurrency,
  clock = () => NOW,
}: {
  releases?: ReleaseSource['releases'];
  core?: () => Promise<SourceResult<CoreRelease[]>>;
  index?: () => Promise<SourceResult<IndexEntry[]>>;
  overrides?: PackageOverrides;
  send?: typeof globalThis.fetch;
  warmPerHour?: number;
  crawlConcurrency?: number;
  clock?: () => Date;
} = {}) {
  const store = mockStore();
  const log = memoryLogger();
  const sleeps: number[] = [];
  const worker = createWorker({
    store,
    log,
    http: () => httpClient({ fetch: send }),
    sources: () => [sourceOf(releases)],
    coreReleases: core,
    index,
    ...(overrides !== undefined && { overrides }),
    ...(warmPerHour !== undefined && { warmPerHour }),
    ...(crawlConcurrency !== undefined && { crawlConcurrency }),
    now: clock,
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
    expect(store.saveReleases).toHaveBeenCalledWith(MIDI, [release()], { source: 'crawl', at: NOW, remove: [] });
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

  it('queues every package held when asked to crawl them again', async () => {
    const lost = { type: 'module', id: 'lost' } as const;
    const { store, log, worker } = setUp();
    store.heldPackages.mockResolvedValue([held(MIDI), held(lost, 'gone')]);
    await expect(worker.recrawl()).resolves.toEqual({ queued: 2 });
    expect(store.requestCrawl).toHaveBeenCalledWith([
      { package: MIDI, reason: 'refresh' },
      { package: lost, reason: 'refresh' },
    ]);
    expect(log.lines).toContainEqual(expect.objectContaining({ message: 'Every package held is queued', packages: 2 }));
  });

  it('queues nothing to crawl again when it holds nothing', async () => {
    const { store, worker } = setUp();
    store.heldPackages.mockResolvedValue([]);
    await expect(worker.recrawl()).resolves.toEqual({ queued: 0 });
    expect(store.requestCrawl).not.toHaveBeenCalled();
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
    const archived: IndexEntry = {
      ref: MIDI,
      lastUpdated: null,
      title: null,
      premium: false,
      archived: true,
      details: NO_DETAILS,
    };
    const other: IndexEntry = { ...archived, ref: { type: 'module', id: 'other' } };
    const { store, worker } = setUp({ index: () => Promise.resolve({ ok: true, value: [other, archived] }) });
    store.nextCrawl.mockResolvedValueOnce(queued());
    await worker.drain();
    expect(store.saveUnavailable).toHaveBeenCalledWith(MIDI, { reason: 'archived' }, { source: 'crawl', at: NOW });
    expect(store.saveReleases).not.toHaveBeenCalled();
  });

  it('removes a release held that is gone and could never be loaded, but keeps one that was loaded', async () => {
    const { store, worker } = setUp();
    store.nextCrawl.mockResolvedValueOnce(queued());
    const misread: Release = { ...release(), version: '2e-13.0.4', detail: 'listed', loadFailed: true };
    const older: Release = { ...release(), version: '12.0.0' };
    store.releasesOf.mockResolvedValue({ releases: [misread, older], asOf: NOW, unavailable: null });

    await worker.drain();

    expect(store.saveReleases).toHaveBeenCalledWith(MIDI, [release()], {
      source: 'crawl',
      at: NOW,
      remove: ['2e-13.0.4'],
    });
  });

  it('removes nothing while a listing could not be read', async () => {
    const releases = () =>
      Promise.resolve<SourceResult<Release[]>>({
        ok: false,
        gap: { source: 'test', url: 'https://files.test/list', reason: 'network' },
      });
    const { store, worker } = setUp({ releases });
    store.nextCrawl.mockResolvedValueOnce(queued());
    const misread: Release = { ...release(), version: '2e-13.0.4', detail: 'listed', loadFailed: true };
    store.releasesOf.mockResolvedValue({ releases: [misread], asOf: NOW, unavailable: null });

    await worker.drain();

    expect(store.saveReleases).toHaveBeenCalledWith(MIDI, [], expect.objectContaining({ remove: [] }));
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

describe('the worker, warming the catalogue', () => {
  const DAE = { type: 'module', id: 'dae' } as const;

  it('queues, to warm, the packages the index lists that it does not hold, after the refresh', async () => {
    const { store, log, worker } = setUp();
    store.unwarmed.mockResolvedValue([MIDI, DAE]);
    await worker.drain();
    expect(store.requestCrawl).toHaveBeenLastCalledWith([
      { package: MIDI, reason: 'warm' },
      { package: DAE, reason: 'warm' },
    ]);
    expect(log.lines).toContainEqual(expect.objectContaining({ job: 'refresh', warmQueued: 2 }));
  });

  it('queues none to warm when warming is off', async () => {
    const { store, worker } = setUp({ warmPerHour: 0 });
    store.unwarmed.mockResolvedValue([MIDI]);
    await worker.drain();
    expect(store.unwarmed).not.toHaveBeenCalled();
    expect(store.requestCrawl).not.toHaveBeenCalledWith([{ package: MIDI, reason: 'warm' }]);
  });

  it('crawls at most so many packages an hour to warm, and any other as soon as it is due', async () => {
    let time = NOW.getTime();
    const { store, worker } = setUp({ warmPerHour: 2, clock: () => new Date(time) });
    const warm = (id: number) => queued({ id, reason: 'warm' });
    // The store gives a package to warm only while the worker says it may.
    const queue = [warm(1), warm(2), warm(3), queued({ id: 4, reason: 'request' })];
    store.nextCrawl.mockImplementation((_at, options) => {
      const next = queue.find(item => options?.warm !== false || item.reason !== 'warm');
      if (next !== undefined) queue.splice(queue.indexOf(next), 1);
      return Promise.resolve(next);
    });

    expect(await worker.drain()).toEqual({ crawled: 3 });
    expect(store.finishCrawl.mock.calls.map(([id]) => id)).toEqual([1, 2, 4]);
    expect(queue).toEqual([warm(3)]);

    // An hour after the first was taken, another may be.
    time += 60 * 60 * 1000;
    expect(await worker.drain()).toEqual({ crawled: 1 });
    expect(store.finishCrawl).toHaveBeenLastCalledWith(3);
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
    details: NO_DETAILS,
  };

  it("keeps the catalogue's copy of Foundry VTT's index, and logs what changed in it", async () => {
    const { store, log, worker } = setUp({ index: () => Promise.resolve({ ok: true, value: [changed] }) });
    store.saveIndex.mockResolvedValue({ added: 1, changed: 2, delisted: 3 });
    await worker.drain();
    expect(store.saveIndex).toHaveBeenCalledWith([changed], NOW);
    expect(log.lines).toContainEqual(
      expect.objectContaining({ job: 'refresh', indexAdded: 1, indexChanged: 2, indexDelisted: 3 }),
    );
  });

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

  it("crawls with the package's own manifest declared, so that what it gives now is read", async () => {
    const releases = vi.fn<ReleaseSource['releases']>(() => Promise.resolve({ ok: true, value: [] }));
    const { store, worker } = setUp({ releases });
    store.nextCrawl.mockResolvedValueOnce(queued());
    store.releasesOf.mockResolvedValue({
      releases: [{ ...release(), manifest: 'https://files.test/midi-qol/module.json' }],
      asOf: NOW,
      unavailable: null,
    });
    store.declaredManifests.mockResolvedValue(['https://files.test/declared.json']);

    await worker.drain();

    expect(releases).toHaveBeenCalledWith(
      MIDI,
      expect.objectContaining({
        declared: ['https://files.test/declared.json', 'https://files.test/midi-qol/module.json'],
      }),
    );
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

describe("the worker, checking packages' own manifests", () => {
  const manifestOf = (id: string) => `https://files.test/${id}/module.json`;
  const at = (ref: PackageRef) => ({ ...release(), package: ref, manifest: manifestOf(ref.id) });

  it('checks those due, records what each gave, and queues those that give a version not held', async () => {
    const newer = { type: 'module', id: 'newer' } as const;
    const same = { type: 'module', id: 'same' } as const;
    const broken = { type: 'module', id: 'broken' } as const;
    const bare = { type: 'module', id: 'bare' } as const;
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === manifestOf('broken')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(Response.json({ version: url === manifestOf('same') ? '13.0.4' : '13.0.5' }));
    });
    const { store, log, worker } = setUp({ send: fetch });
    store.ownChecksDue.mockResolvedValue([newer, same, broken, bare]);
    store.releasesOfEach.mockImplementation(asked =>
      Promise.resolve(
        new Map(
          asked
            .filter(ref => ref !== bare)
            .map(ref => [`module:${ref.id}`, { releases: [at(ref)], asOf: NOW, unavailable: null }]),
        ),
      ),
    );

    await worker.drain();

    // Due: checked an hour ago or more, at most a thousand.
    expect(store.ownChecksDue).toHaveBeenCalledWith(new Date(NOW.getTime() - 60 * 60 * 1000), 1000);
    expect(store.saveOwnChecks).toHaveBeenCalledWith(
      [
        { ref: newer, outcome: 'read', version: '13.0.5', changed: true },
        { ref: same, outcome: 'read', version: '13.0.4', changed: false },
        { ref: broken, outcome: 'failed', changed: false },
        { ref: bare, outcome: 'none', changed: false },
      ],
      NOW,
    );
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: newer, reason: 'refresh' }]);
    expect(log.lines).toContainEqual(
      expect.objectContaining({ job: 'own-manifests', checked: 4, read: 2, failed: 1, changed: 1 }),
    );
  });

  it('checks them through a client of their own, when given one', async () => {
    const crawling = vi.fn<typeof globalThis.fetch>();
    const checking = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(Response.json({ version: '13.0.4' })));
    const store = mockStore();
    store.ownChecksDue.mockResolvedValue([MIDI]);
    store.releasesOfEach.mockResolvedValue(
      new Map([['module:midi-qol', { releases: [at(MIDI)], asOf: NOW, unavailable: null }]]),
    );
    const worker = createWorker({
      store,
      log: memoryLogger(),
      http: () => httpClient({ fetch: crawling }),
      ownHttp: () => httpClient({ fetch: checking }),
      sources: () => [],
      coreReleases: () => Promise.resolve({ ok: true, value: [] }),
      index: () => Promise.resolve({ ok: true, value: [] }),
      now: () => NOW,
    });
    await worker.drain();
    expect(checking).toHaveBeenCalledWith(manifestOf('midi-qol'), expect.anything());
    expect(crawling).not.toHaveBeenCalled();
  });

  it('queues none when none gives a version not held', async () => {
    const { store, worker } = setUp();
    await worker.drain();
    expect(store.saveOwnChecks).toHaveBeenCalledWith([], NOW);
    expect(store.requestCrawl.mock.calls.filter(([requests]) => requests.length > 0)).toEqual([]);
  });

  it('does not check again within five minutes', async () => {
    const { store, worker } = setUp();
    store.lastSuccess.mockImplementation(job =>
      Promise.resolve(job === 'own-manifests' ? new Date(NOW.getTime() - 4 * 60 * 1000) : null),
    );
    await worker.drain();
    expect(store.ownChecksDue).not.toHaveBeenCalled();
  });
});

describe("the worker, comparing the catalogue with Foundry VTT's index", () => {
  const listedVersion = {
    version: '13.0.5',
    minimum: '13',
    maximum: null,
    verified: null,
    manifest: null,
    notes: null,
  };

  it('keeps the report, and queues the packages concerned to be crawled again', async () => {
    const { store, log, worker } = setUp();
    store.consistencyInputs.mockResolvedValue({
      indexed: [{ ref: MIDI, archived: false, latestVersion: null, versions: [listedVersion] }],
      held: [{ ref: MIDI, unavailable: null, ownVersion: null, releases: [{ version: '13.0.4' }] }],
    });
    await worker.drain();
    expect(store.requestCrawl).toHaveBeenCalledWith([{ package: MIDI, reason: 'refresh' }]);
    const report = {
      at: NOW.toISOString(),
      listed: 1,
      held: 1,
      versionsMissing: 1,
      latestMissing: 0,
      listingsDiffer: 0,
      archivedHeld: 0,
      ownMissing: 0,
      requeued: 1,
    };
    expect(store.saveConsistency).toHaveBeenCalledWith(report);
    expect(log.lines).toContainEqual(expect.objectContaining({ job: 'consistency', versionsMissing: 1, requeued: 1 }));
  });

  it('queues at most five hundred, and none when nothing is wrong', async () => {
    const refs = Array.from({ length: 501 }, (_, index) => ({ type: 'module', id: `pkg-${String(index)}` }) as const);
    const { store, worker } = setUp();
    store.consistencyInputs.mockResolvedValue({
      indexed: refs.map(ref => ({ ref, archived: false, latestVersion: '2.0.0', versions: [] })),
      held: refs.map(ref => ({ ref, unavailable: null, ownVersion: null, releases: [] })),
    });
    await worker.drain();
    expect(store.saveConsistency).toHaveBeenCalledWith(expect.objectContaining({ latestMissing: 501, requeued: 500 }));
    expect(store.requestCrawl.mock.calls.find(([requests]) => requests.length === 500)).toBeDefined();

    const quiet = setUp();
    await quiet.worker.drain();
    expect(quiet.store.saveConsistency).toHaveBeenCalledWith(expect.objectContaining({ listed: 0, requeued: 0 }));
    expect(quiet.store.requestCrawl.mock.calls.filter(([requests]) => requests.length > 0)).toEqual([]);
  });

  it('compares once a day', async () => {
    const { store, worker } = setUp();
    store.lastSuccess.mockImplementation(job =>
      Promise.resolve(job === 'consistency' ? new Date(NOW.getTime() - 23 * 60 * 60 * 1000) : null),
    );
    await worker.drain();
    expect(store.consistencyInputs).not.toHaveBeenCalled();
  });
});

describe('the worker, crawling several packages at once', () => {
  /** Sources whose every listing waits until released, so that crawls stay in hand; and the queue they come from. */
  function held(count: number) {
    const pending: (() => void)[] = [];
    const releases = vi.fn<ReleaseSource['releases']>(
      () =>
        new Promise(resolve => {
          pending.push(() => {
            resolve({ ok: true, value: [] });
          });
        }),
    );
    const queue = Array.from({ length: count }, (_, index) => queued({ id: index + 1 }));
    const next = () => Promise.resolve(queue.shift());
    return { releases, next, release: () => pending.shift()?.() };
  }
  const settled = () => new Promise(resolve => setTimeout(resolve, 0));

  it('drains the queue with at most so many crawls in hand at once', async () => {
    const { releases, next, release } = held(3);
    const { store, worker } = setUp({ releases, crawlConcurrency: 2 });
    store.nextCrawl.mockImplementation(next);
    const drained = worker.drain();
    await settled();
    expect(releases).toHaveBeenCalledTimes(2);
    release();
    await settled();
    expect(releases).toHaveBeenCalledTimes(3);
    release();
    release();
    expect(await drained).toEqual({ crawled: 3 });
    expect(store.finishCrawl.mock.calls.map(([id]) => id).toSorted()).toEqual([1, 2, 3]);
  });

  it('crawls what a crawl done queued, in the same drain', async () => {
    const { store, worker } = setUp({ crawlConcurrency: 2 });
    store.nextCrawl.mockResolvedValueOnce(queued({ id: 1 }));
    store.requestCrawl.mockImplementationOnce(() => {
      store.nextCrawl.mockResolvedValueOnce(queued({ id: 2 }));
      return Promise.resolve();
    });
    expect(await worker.drain()).toEqual({ crawled: 2 });
  });

  it('runs with as many crawls in hand as it may, waiting for one to be done rather than sleeping', async () => {
    const { releases, next, release } = held(3);
    const { store, worker, sleeps } = setUp({ releases, crawlConcurrency: 2 });
    const stop = new AbortController();
    store.nextCrawl.mockImplementation(next);
    const running = worker.run(stop.signal);
    await settled();
    expect(releases).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([]);
    release();
    await settled();
    expect(releases).toHaveBeenCalledTimes(3);
    // Stopped, it finishes the crawls in hand.
    stop.abort();
    release();
    release();
    await running;
    expect(store.finishCrawl).toHaveBeenCalledTimes(3);
  });

  it('logs a crawl that failed and could not be deferred, and goes on', async () => {
    const { store, log, worker } = setUp({ releases: () => Promise.reject(new Error('down')) });
    store.nextCrawl.mockResolvedValueOnce(queued());
    store.deferCrawl.mockRejectedValueOnce(new Error('connection refused'));
    expect(await worker.drain()).toEqual({ crawled: 1 });
    expect(log.lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: 'The crawl could not be deferred',
        package: 'module:midi-qol',
      }),
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

describe('the worker, stopped while it waits', () => {
  it('stops waiting at once', async () => {
    const store = mockStore();
    const stop = new AbortController();
    const waits: AbortSignal[] = [];
    const worker = createWorker({
      store,
      log: memoryLogger(),
      http: () => httpClient({ fetch: vi.fn<typeof fetch>() }),
      sources: () => [],
      coreReleases: () => Promise.resolve({ ok: true, value: [] }),
      index: () => Promise.resolve({ ok: true, value: [] }),
      now: () => NOW,
      // Waits until told to stop waiting, however long it was asked to wait.
      sleep: (_ms, signal) =>
        new Promise(resolve => {
          waits.push(signal);
          signal.addEventListener('abort', () => {
            resolve();
          });
        }),
    });
    const running = worker.run(stop.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(waits).toHaveLength(1);
    stop.abort();
    await running;
    expect(waits[0]?.aborted).toBe(true);
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
