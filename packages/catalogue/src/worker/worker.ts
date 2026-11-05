/**
 * The worker's jobs: crawling the packages on the queue, and keeping Foundry VTT's builds up to date. Everything it
 * reaches outside the database, it is given, so that the tests can stand in for the web.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';

import { checkConsistency } from '#lib/server/consistency.js';
import { crawlPackage } from '#lib/server/crawl.js';
import { unavailableOf } from '#lib/server/overrides.js';
import { checkOwnManifests, ownManifest, planRefresh } from '#lib/server/refresh.js';

import type { CoreRelease } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, ReleaseSource, SourceResult } from '@mondarth/fvtt-resolver/sources';
import type { Logger } from '#lib/server/log.js';
import type { PackageOverrides } from '#lib/server/overrides.js';
import type { IndexEntry } from '#lib/server/refresh.js';
import type { CatalogueStore, QueuedCrawl } from '#lib/server/store/types.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The most packages whose own manifests are checked in one run of the job. */
const OWN_CHECK_BATCH = 1000;

/** The most packages a consistency check queues to be crawled again. */
const CONSISTENCY_REQUEUE = 500;

/** What the worker works with. */
export interface WorkerOptions {
  readonly store: CatalogueStore;
  readonly log: Logger;
  /** A client for one job, with a budget of its own. */
  readonly http: () => HttpClient;
  /**
   * A client for one run of the checks of packages' own manifests, with a cache of their versions of its own, so that
   * crawls do not push them out of it (see `lru-cache.ts`); `http` by default.
   */
  readonly ownHttp?: () => HttpClient;
  /** The sources of releases, in order, fetching through a job's client. */
  readonly sources: (http: HttpClient) => ReleaseSource[];
  /** Foundry VTT's builds, fetched through a job's client. */
  readonly coreReleases: (http: HttpClient) => Promise<SourceResult<CoreRelease[]>>;
  /** Foundry VTT's index, fetched through a job's client. */
  readonly index: (http: HttpClient) => Promise<SourceResult<IndexEntry[]>>;
  /** What the catalogue is told of packages whose sources mislead it, by package key; none by default. */
  readonly overrides?: PackageOverrides;
  /** The time now; the clock by default. */
  readonly now?: () => Date;
  /** Waits, or stops waiting when the signal aborts; {@link sleep} by default. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** How long to wait when there is nothing to crawl; five seconds by default. */
  readonly pollMs?: number;
  /** How often Foundry VTT's builds are fetched; daily by default. */
  readonly coreEveryMs?: number;
  /** How often the packages held are checked for changes; hourly by default. */
  readonly refreshEveryMs?: number;
  /** How long a package Foundry VTT's index does not list waits to be crawled again; a week by default. */
  readonly staleMs?: number;
  /**
   * The most packages crawled in an hour to warm the catalogue, those the index lists that no client has needed yet;
   * 300 by default. None queues none.
   */
  readonly warmPerHour?: number;
  /** How many packages are crawled at once; four by default. */
  readonly crawlConcurrency?: number;
  /** How often the packages' own manifests due a check are checked; every five minutes by default. */
  readonly ownCheckEveryMs?: number;
  /** How long after its last check a package's own manifest is due another; an hour by default. */
  readonly ownCheckStaleMs?: number;
  /** How often what the catalogue holds is compared with Foundry VTT's index; daily by default. */
  readonly consistencyEveryMs?: number;
}

/** The worker. */
export interface Worker {
  /** Works until the signal aborts, finishing the crawls in hand. */
  run(signal: AbortSignal): Promise<void>;
  /**
   * Fetches Foundry VTT's builds and checks the packages held for changes, if those are due, then crawls what is on
   * the queue and due, several at once, and returns.
   */
  drain(): Promise<{ crawled: number }>;
  /**
   * Queues every package held to be crawled again, as after an upgrade that crawls differently, then returns. The worker
   * that runs crawls them.
   */
  recrawl(): Promise<{ queued: number }>;
}

/**
 * How long a package waits after failing this many times: a minute, doubling each time, to a day at most.
 *
 * @param attempts - The failures so far, before this one
 * @returns Milliseconds
 */
export function backoff(attempts: number): number {
  return Math.min(MINUTE * 2 ** attempts, DAY);
}

/**
 * Waits, or stops waiting when the signal aborts.
 *
 * @param ms - How long
 * @param signal - Stops the wait
 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    // An abort that has happened already is never heard by a listener added now.
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/** The message of whatever was thrown. */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Makes the worker.
 *
 * @param options - The store, and the web through its sources
 * @returns The worker
 */
export function createWorker({
  store,
  log,
  http,
  ownHttp = http,
  sources,
  coreReleases,
  index,
  overrides = {},
  now = () => new Date(),
  sleep: wait = sleep,
  pollMs = 5000,
  coreEveryMs = DAY,
  refreshEveryMs = HOUR,
  staleMs = 7 * DAY,
  warmPerHour = 300,
  crawlConcurrency = 4,
  ownCheckEveryMs = 5 * MINUTE,
  ownCheckStaleMs = HOUR,
  consistencyEveryMs = DAY,
}: WorkerOptions): Worker {
  /**
   * Runs a job with a client of its own, from `clientFor`, recording the run; whatever it throws is rethrown once
   * recorded. What the work returns is logged with the job.
   */
  async function job(
    name: string,
    fields: Record<string, unknown>,
    work: (client: HttpClient) => Promise<Record<string, unknown> | undefined>,
    clientFor: () => HttpClient = http,
  ) {
    const client = clientFor();
    const id = await store.startRun(name, now());
    try {
      const done = await work(client);
      await store.finishRun(id, { at: now(), outcome: 'ok', requests: client.requests() });
      log.info('The job is done', { job: name, ...fields, ...done, requests: client.requests() });
    } catch (error) {
      await store.finishRun(id, { at: now(), outcome: 'failed', requests: client.requests(), error: messageOf(error) });
      throw error;
    }
  }

  /**
   * Runs a job unless it last ended well within `everyMs`. A failure is logged, not thrown: what the job keeps up to
   * date is still good, and the next pass tries again.
   */
  async function periodic(
    name: string,
    everyMs: number,
    failed: string,
    work: (client: HttpClient) => Promise<Record<string, unknown> | undefined>,
    clientFor: () => HttpClient = http,
  ): Promise<void> {
    const last = await store.lastSuccess(name);
    if (last !== null && now().getTime() - last.getTime() < everyMs) return;
    try {
      await job(name, {}, work, clientFor);
    } catch (error) {
      log.warn(failed, { error });
    }
  }

  /** Fetches Foundry VTT's builds. */
  const syncCore = () =>
    periodic('core', coreEveryMs, "Foundry VTT's builds were not brought up to date", async client => {
      const found = await coreReleases(client);
      if (!found.ok) throw new Error(`Foundry VTT's builds could not be read: ${found.gap.reason} ${found.gap.url}`);
      await store.saveCoreReleases(found.value);
      return { builds: found.value.length };
    });

  /**
   * Keeps the catalogue's copy of Foundry VTT's index, and queues the packages held that changed, or that are old
   * enough, to be crawled again, as the index says. Then queues, to warm, the packages the index lists that the
   * catalogue does not hold.
   */
  const refresh = () =>
    periodic('refresh', refreshEveryMs, 'The packages held were not checked for changes', async client => {
      const found = await index(client);
      if (!found.ok) throw new Error(`Foundry VTT's index could not be read: ${found.gap.reason} ${found.gap.url}`);
      const indexed = await store.saveIndex(found.value, now());
      const held = await store.heldPackages();
      const plan = planRefresh(held, found.value, { now: now(), staleMs });
      await store.saveListings(plan.listings);
      await store.requestCrawl(plan.refresh.map(ref => ({ package: ref, reason: 'refresh' })));
      const unwarmed = warmPerHour > 0 ? await store.unwarmed() : [];
      if (unwarmed.length > 0) await store.requestCrawl(unwarmed.map(ref => ({ package: ref, reason: 'warm' })));
      return {
        refreshed: plan.refresh.length,
        listings: plan.listings.length,
        indexAdded: indexed.added,
        indexChanged: indexed.changed,
        indexDelisted: indexed.delisted,
        warmQueued: unwarmed.length,
      };
    });

  /**
   * Checks the own manifests of the packages due a check, those last checked `ownCheckStaleMs` ago or never, so each
   * about once an hour, and queues those that give a version not held to be crawled again.
   */
  const checkOwn = () =>
    periodic(
      'own-manifests',
      ownCheckEveryMs,
      "The packages' own manifests were not checked",
      async client => {
        const due = await store.ownChecksDue(new Date(now().getTime() - ownCheckStaleMs), OWN_CHECK_BATCH);
        const held = await store.releasesOfEach(due);
        const checks = await checkOwnManifests(
          client,
          due.map(ref => ({ ref, releases: held.get(packageKey(ref))?.releases ?? [] })),
        );
        await store.saveOwnChecks(checks, now());
        const changed = checks.filter(check => check.changed).map(check => check.ref);
        if (changed.length > 0) await store.requestCrawl(changed.map(ref => ({ package: ref, reason: 'refresh' })));
        return {
          checked: checks.length,
          read: checks.filter(check => check.outcome === 'read').length,
          failed: checks.filter(check => check.outcome === 'failed').length,
          changed: changed.length,
        };
      },
      ownHttp,
    );

  /**
   * Compares what the catalogue holds with its copy of Foundry VTT's index (see `consistency.ts`), keeps the report for
   * `/status`, and queues the packages concerned, as many as `CONSISTENCY_REQUEUE`, to be crawled again.
   */
  const checkIndex = () =>
    periodic('consistency', consistencyEveryMs, 'The catalogue was not compared with the index', async () => {
      const { indexed, held } = await store.consistencyInputs();
      const { concerned, ...counts } = checkConsistency(indexed, held, overrides);
      const requeued = concerned.slice(0, CONSISTENCY_REQUEUE);
      if (requeued.length > 0) await store.requestCrawl(requeued.map(ref => ({ package: ref, reason: 'refresh' })));
      await store.saveConsistency({ at: now().toISOString(), ...counts, requeued: requeued.length });
      return { ...counts, requeued: requeued.length };
    });

  /** Whether the packages held with overrides were queued, which is done once, when the worker starts. */
  let overridesQueued = false;

  /**
   * Queues the packages held that have overrides, once: the overrides are read when the worker starts, so one that
   * changed applies at once, not at the package's next refresh. So is a package held as gone whose override no longer
   * says so. A package not held is left until a client needs it.
   */
  async function queueOverridden(): Promise<void> {
    if (overridesQueued) return;
    const held = (await store.heldPackages()).filter(
      ({ ref, unavailable }) => Object.hasOwn(overrides, packageKey(ref)) || unavailable === 'gone',
    );
    if (held.length > 0) {
      await store.requestCrawl(held.map(({ ref }) => ({ package: ref, reason: 'refresh' })));
      log.info('The packages with overrides are queued', { packages: held.length });
    }
    overridesQueued = true;
  }

  /** Crawls one package from the queue, deferring it if the crawl fails. Rejects only if it cannot be deferred. */
  async function crawl(item: QueuedCrawl): Promise<void> {
    const ref = item.package;
    const key = packageKey(ref);
    try {
      await job('crawl', { package: key, reason: item.reason }, async client => {
        // A package that cannot be had is not crawled: whatever was held of it goes, with its gaps.
        const listed = await index(client);
        const archived = listed.ok && listed.value.some(entry => packageKey(entry.ref) === key && entry.archived);
        const unavailable = unavailableOf(overrides[key], archived);
        if (unavailable !== null) {
          await store.saveUnavailable(ref, unavailable, { source: 'crawl', at: now() });
          await store.replaceGaps(key, []);
          await store.finishCrawl(item.id);
          return { unavailable: unavailable.reason };
        }
        const [held, manifests, core] = await Promise.all([
          store.releasesOf(ref),
          store.declaredManifests(ref),
          store.coreReleases(),
        ]);
        // The package's own manifest is declared too, so that the version it gives now is read, as Foundry VTT's updater
        // reads it, though the index does not list that version yet: a listing's manifest URLs only load what it lists.
        const own = ownManifest(held?.releases ?? []);
        const found = await crawlPackage(ref, {
          http: client,
          sources: sources(client),
          core,
          held: held?.releases ?? [],
          manifests: own === undefined || manifests.includes(own) ? manifests : [...manifests, own],
          override: overrides[key],
        });
        // Saved even when none was found, so that the package is known, and not asked for again until it is due.
        await store.saveReleases(ref, found.releases, { source: 'crawl', at: now(), remove: found.gone });
        await store.replaceGaps(key, found.gaps);
        const unknown = await store.unknownOf(found.named);
        await store.requestCrawl(unknown.map(other => ({ package: other, reason: 'closure' })));
        await store.finishCrawl(item.id);
        return {
          releases: found.releases.length,
          gaps: found.gaps.length,
          removed: found.gone.length,
          queued: unknown.length,
        };
      });
    } catch (error) {
      const until = new Date(now().getTime() + backoff(item.attempts));
      await store.deferCrawl(item.id, until);
      log.error('The crawl failed', { package: key, attempts: item.attempts + 1, until: until.toISOString(), error });
    }
  }

  /** When each package crawled to warm in the last hour was taken from the queue, oldest first. */
  const warmed: number[] = [];

  /** Whether another package may be crawled to warm this hour. */
  function mayWarm(at: number): boolean {
    while (warmed[0] !== undefined && at - warmed[0] >= HOUR) warmed.shift();
    return warmed.length < warmPerHour;
  }

  /** The crawls in hand, each removing itself once done. */
  const inHand = new Set<Promise<void>>();

  /**
   * Starts crawls of the packages due, until `crawlConcurrency` are in hand or none is due. The store hands each to one
   * crawl alone. Packages queued to warm are crawled at most `warmPerHour` an hour, so that warming the whole index is
   * spread out; any other is crawled as soon as it is due.
   *
   * @returns How many were started
   */
  async function startCrawls(): Promise<number> {
    let started = 0;
    while (inHand.size < crawlConcurrency) {
      const at = now();
      const item = await store.nextCrawl(at, { warm: mayWarm(at.getTime()) });
      if (item === undefined) break;
      if (item.reason === 'warm') warmed.push(at.getTime());
      const crawling: Promise<void> = crawl(item)
        .catch((error: unknown) => {
          // Left on the queue as it was taken: the store hands it out again once its hold runs out.
          log.error('The crawl could not be deferred', { package: packageKey(item.package), error });
        })
        .finally(() => inHand.delete(crawling));
      inHand.add(crawling);
      started++;
    }
    return started;
  }

  /** Resolves once a crawl in hand is done, or the wait is over, whichever is first; the wait is cut short then. */
  async function untilCrawled(ms: number, signal: AbortSignal): Promise<void> {
    const pause = new AbortController();
    const stop = () => {
      pause.abort();
    };
    // An abort that has happened already is never heard by a listener added now.
    if (signal.aborted) pause.abort();
    signal.addEventListener('abort', stop, { once: true });
    try {
      await Promise.race([wait(ms, pause.signal), ...inHand]);
    } finally {
      pause.abort();
      signal.removeEventListener('abort', stop);
    }
  }

  return {
    async run(signal) {
      log.info('The worker started', {
        pollMs,
        coreEveryMs,
        refreshEveryMs,
        staleMs,
        warmPerHour,
        crawlConcurrency,
        ownCheckEveryMs,
        ownCheckStaleMs,
        consistencyEveryMs,
        overrides: Object.keys(overrides).length,
      });
      while (!signal.aborted) {
        try {
          await queueOverridden();
          await syncCore();
          await refresh();
          await checkOwn();
          await checkIndex();
          await startCrawls();
        } catch (error) {
          // The database, most likely: wait, and try again.
          log.error('The worker could not reach the store', { error });
        }
        // As many crawls in hand as may be: on once one is done. Fewer, as none more is due: on once one is done, or
        // the wait is over, to look again.
        if (inHand.size >= crawlConcurrency) await Promise.race(inHand);
        else await untilCrawled(pollMs, signal);
      }
      await Promise.all(inHand);
      log.info('The worker stopped');
    },

    async drain() {
      await queueOverridden();
      await syncCore();
      await refresh();
      await checkOwn();
      await checkIndex();
      let crawled = 0;
      // A crawl done may queue more, as a closure: the queue is drained once none is due and none is in hand.
      for (;;) {
        crawled += await startCrawls();
        if (inHand.size === 0) return { crawled };
        await Promise.race(inHand);
      }
    },

    async recrawl() {
      const held = await store.heldPackages();
      if (held.length > 0) await store.requestCrawl(held.map(({ ref }) => ({ package: ref, reason: 'refresh' })));
      log.info('Every package held is queued', { packages: held.length });
      return { queued: held.length };
    },
  };
}
