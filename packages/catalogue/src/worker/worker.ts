/**
 * The worker's jobs: crawling the packages on the queue, and keeping Foundry VTT's builds up to date. Everything it
 * reaches outside the database, it is given, so that the tests can stand in for the web.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';

import { crawlPackage } from '#lib/server/crawl.js';
import { planRefresh } from '#lib/server/refresh.js';

import type { CoreRelease } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, ReleaseSource, SourceResult } from '@mondarth/fvtt-resolver/sources';
import type { Logger } from '#lib/server/log.js';
import type { PackageOverrides } from '#lib/server/overrides.js';
import type { IndexEntry } from '#lib/server/refresh.js';
import type { CatalogueStore, QueuedCrawl } from '#lib/server/store/types.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What the worker works with. */
export interface WorkerOptions {
  readonly store: CatalogueStore;
  readonly log: Logger;
  /** A client for one job, with a budget of its own. */
  readonly http: () => HttpClient;
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
}

/** The worker. */
export interface Worker {
  /** Works until the signal aborts, finishing the job in hand. */
  run(signal: AbortSignal): Promise<void>;
  /**
   * Fetches Foundry VTT's builds and checks the packages held for changes, if those are due, then crawls what is on
   * the queue and due, and returns.
   */
  drain(): Promise<{ crawled: number }>;
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
}: WorkerOptions): Worker {
  /**
   * Runs a job with a client of its own, recording the run; whatever it throws is rethrown once recorded. What the work
   * returns is logged with the job.
   */
  async function job(
    name: string,
    fields: Record<string, unknown>,
    work: (client: HttpClient) => Promise<Record<string, unknown> | undefined>,
  ) {
    const client = http();
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
  ): Promise<void> {
    const last = await store.lastSuccess(name);
    if (last !== null && now().getTime() - last.getTime() < everyMs) return;
    try {
      await job(name, {}, work);
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

  /** Queues the packages held that changed, or that are old enough, to be crawled again. */
  const refresh = () =>
    periodic('refresh', refreshEveryMs, 'The packages held were not checked for changes', async client => {
      const found = await index(client);
      if (!found.ok) throw new Error(`Foundry VTT's index could not be read: ${found.gap.reason} ${found.gap.url}`);
      const plan = planRefresh(await store.heldPackages(), found.value, { now: now(), staleMs });
      await store.saveListings(plan.listings);
      await store.requestCrawl(plan.refresh.map(ref => ({ package: ref, reason: 'refresh' })));
      return { refreshed: plan.refresh.length, listings: plan.listings.length };
    });

  /** Whether the packages held with overrides were queued, which is done once, when the worker starts. */
  let overridesQueued = false;

  /**
   * Queues the packages held that have overrides, once: the overrides are read when the worker starts, so one that
   * changed applies at once, not at the package's next refresh. A package not held is left until a client needs it.
   */
  async function queueOverridden(): Promise<void> {
    if (overridesQueued) return;
    const keys = new Set(Object.keys(overrides));
    const held = keys.size === 0 ? [] : (await store.heldPackages()).filter(({ ref }) => keys.has(packageKey(ref)));
    if (held.length > 0) {
      await store.requestCrawl(held.map(({ ref }) => ({ package: ref, reason: 'refresh' })));
      log.info('The packages with overrides are queued', { packages: held.length });
    }
    overridesQueued = true;
  }

  /** Crawls one package from the queue, deferring it if the crawl fails. */
  async function crawl(item: QueuedCrawl): Promise<void> {
    const ref = item.package;
    const key = packageKey(ref);
    try {
      await job('crawl', { package: key, reason: item.reason }, async client => {
        const [held, manifests, core] = await Promise.all([
          store.releasesOf(ref),
          store.declaredManifests(ref),
          store.coreReleases(),
        ]);
        const found = await crawlPackage(ref, {
          http: client,
          sources: sources(client),
          core,
          held: held?.releases ?? [],
          manifests,
          override: overrides[key],
        });
        // Saved even when none was found, so that the package is known, and not asked for again until it is due.
        await store.saveReleases(ref, found.releases, { source: 'crawl', at: now() });
        await store.replaceGaps(key, found.gaps);
        const unknown = await store.unknownOf(found.named);
        await store.requestCrawl(unknown.map(other => ({ package: other, reason: 'closure' })));
        await store.finishCrawl(item.id);
        return { releases: found.releases.length, gaps: found.gaps.length, queued: unknown.length };
      });
    } catch (error) {
      const until = new Date(now().getTime() + backoff(item.attempts));
      await store.deferCrawl(item.id, until);
      log.error('The crawl failed', { package: key, attempts: item.attempts + 1, until: until.toISOString(), error });
    }
  }

  /** Crawls the next package due, if there is one. */
  async function crawlNext(): Promise<boolean> {
    const item = await store.nextCrawl(now());
    if (item === undefined) return false;
    await crawl(item);
    return true;
  }

  return {
    async run(signal) {
      log.info('The worker started', {
        pollMs,
        coreEveryMs,
        refreshEveryMs,
        staleMs,
        overrides: Object.keys(overrides).length,
      });
      while (!signal.aborted) {
        let worked = false;
        try {
          await queueOverridden();
          await syncCore();
          await refresh();
          worked = await crawlNext();
        } catch (error) {
          // The database, most likely: wait, and try again.
          log.error('The worker could not reach the store', { error });
        }
        if (!worked) await wait(pollMs, signal);
      }
      log.info('The worker stopped');
    },

    async drain() {
      await queueOverridden();
      await syncCore();
      await refresh();
      let crawled = 0;
      while (await crawlNext()) crawled++;
      return { crawled };
    },
  };
}
