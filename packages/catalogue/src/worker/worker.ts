/**
 * The worker's jobs: crawling the packages on the queue, and keeping Foundry VTT's builds up to date. Everything it
 * reaches outside the database, it is given, so that the tests can stand in for the web.
 */
import { packageKey } from '@mondarth/fvtt-package-catalogue-contract';

import { crawlPackage } from '#lib/server/crawl.js';

import type { CoreRelease } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient, ReleaseSource, SourceResult } from '@mondarth/fvtt-resolver/sources';
import type { Logger } from '#lib/server/log.js';
import type { CatalogueStore, QueuedCrawl } from '#lib/server/store/types.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

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
  /** The time now; the clock by default. */
  readonly now?: () => Date;
  /** Waits, or stops waiting when the signal aborts; {@link sleep} by default. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** How long to wait when there is nothing to crawl; five seconds by default. */
  readonly pollMs?: number;
  /** How often Foundry VTT's builds are fetched; daily by default. */
  readonly coreEveryMs?: number;
}

/** The worker. */
export interface Worker {
  /** Works until the signal aborts, finishing the job in hand. */
  run(signal: AbortSignal): Promise<void>;
  /** Fetches Foundry VTT's builds if they are due, then crawls what is on the queue and due, and returns. */
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
  now = () => new Date(),
  sleep: wait = sleep,
  pollMs = 5000,
  coreEveryMs = DAY,
}: WorkerOptions): Worker {
  /** Runs a job with a client of its own, recording the run; whatever it throws is rethrown once recorded. */
  async function job(name: string, fields: Record<string, unknown>, work: (client: HttpClient) => Promise<void>) {
    const client = http();
    const id = await store.startRun(name, now());
    try {
      await work(client);
      await store.finishRun(id, { at: now(), outcome: 'ok', requests: client.requests() });
      log.info('The job is done', { job: name, ...fields, requests: client.requests() });
    } catch (error) {
      await store.finishRun(id, { at: now(), outcome: 'failed', requests: client.requests(), error: messageOf(error) });
      throw error;
    }
  }

  /** Fetches Foundry VTT's builds, unless they were fetched recently. */
  async function syncCore(): Promise<void> {
    const last = await store.lastSuccess('core');
    if (last !== null && now().getTime() - last.getTime() < coreEveryMs) return;
    try {
      await job('core', {}, async client => {
        const found = await coreReleases(client);
        if (!found.ok) throw new Error(`Foundry VTT's builds could not be read: ${found.gap.reason} ${found.gap.url}`);
        await store.saveCoreReleases(found.value);
      });
    } catch (error) {
      // Builds held are still good; the next run tries again.
      log.warn("Foundry VTT's builds were not brought up to date", { error });
    }
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
        });
        // Saved even when none was found, so that the package is known, and not asked for again until it is due.
        await store.saveReleases(ref, found.releases, { source: 'crawl', at: now() });
        await store.replaceGaps(key, found.gaps);
        const unknown = await store.unknownOf(found.named);
        await store.requestCrawl(unknown.map(other => ({ package: other, reason: 'closure' })));
        await store.finishCrawl(item.id);
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
      log.info('The worker started', { pollMs, coreEveryMs });
      while (!signal.aborted) {
        let worked = false;
        try {
          await syncCore();
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
      await syncCore();
      let crawled = 0;
      while (await crawlNext()) crawled++;
      return { crawled };
    },
  };
}
