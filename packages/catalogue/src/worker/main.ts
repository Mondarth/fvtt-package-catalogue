/**
 * The worker: the catalogue's process for work outside requests.
 *
 *   node build/worker/main.js migrate   applies the database migrations, then exits
 *   node build/worker/main.js run       crawls the queue, refreshes what changed and keeps Foundry VTT's builds up to
 *                                       date, until stopped
 *   node build/worker/main.js drain     does what is due now, then exits
 */
import {
  foundryCoreReleases,
  foundryIndexSource,
  githubSource,
  gitlabSource,
  httpClient,
  manifestUrlSource,
  memoryCache,
} from '@mondarth/fvtt-resolver/sources';

import { readConfig } from '#lib/server/config.js';
import { connect } from '#lib/server/db/connect.js';
import { createLogger } from '#lib/server/log.js';
import { fetchIndex } from '#lib/server/refresh.js';
import { drizzleStore } from '#lib/server/store/drizzle.js';

import { createWorker } from './worker.js';

const COMMANDS = ['migrate', 'run', 'drain'];

const config = readConfig(process.env);
const log = createLogger({ level: config.LOG_LEVEL }).child({ process: 'worker' });
const [command] = process.argv.slice(2);

/** The worker, over the database and the web. */
function workerOver(connection: ReturnType<typeof connect>) {
  // One cache for the process: Foundry VTT's index is fetched once in five minutes, not once a crawl.
  const cache = memoryCache();
  return createWorker({
    store: drizzleStore(connection.db),
    log,
    http: () =>
      httpClient({
        fetch: globalThis.fetch,
        cache,
        budget: { maxRequests: config.CRAWL_MAX_REQUESTS },
        userAgent: `fvtt-package-catalogue/${__CATALOGUE_VERSION__} (+https://github.com/Mondarth/fvtt-package-catalogue)`,
      }),
    sources: http => [
      foundryIndexSource(http, { indexUrl: config.FOUNDRY_INDEX_URL }),
      githubSource(http, { ...(config.GITHUB_TOKEN !== undefined && { token: config.GITHUB_TOKEN }) }),
      gitlabSource(http, { ...(config.GITLAB_TOKEN !== undefined && { token: config.GITLAB_TOKEN }) }),
      manifestUrlSource(http),
    ],
    coreReleases: http => foundryCoreReleases(http, { url: config.FOUNDRY_RELEASES_URL }),
    index: http => fetchIndex(http, config.FOUNDRY_INDEX_URL),
    pollMs: config.CRAWL_POLL_SECONDS * 1000,
    refreshEveryMs: config.REFRESH_MINUTES * 60 * 1000,
    staleMs: config.REFRESH_STALE_DAYS * 24 * 60 * 60 * 1000,
  });
}

async function main(): Promise<number> {
  if (command === undefined || !COMMANDS.includes(command)) {
    log.error('Unknown command', { command, commands: COMMANDS });
    return 2;
  }
  const connection = connect(config.DATABASE_URL);
  try {
    switch (command) {
      case 'migrate':
        await connection.migrate(config.MIGRATIONS_DIR);
        log.info('The database is up to date', { migrations: config.MIGRATIONS_DIR });
        return 0;
      case 'drain': {
        const { crawled } = await workerOver(connection).drain();
        log.info('The queue is drained', { crawled });
        return 0;
      }
      default: {
        // Docker stops a container with SIGTERM; the job in hand is finished first.
        const stop = new AbortController();
        for (const signal of ['SIGTERM', 'SIGINT'] as const) {
          process.once(signal, () => {
            stop.abort();
          });
        }
        await workerOver(connection).run(stop.signal);
        return 0;
      }
    }
  } finally {
    await connection.close();
  }
}

main().then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    log.error('The worker failed', { command, error });
    process.exitCode = 1;
  },
);
