import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { UNIVERSE_PATH, UniverseResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { connect } from '../../../src/lib/server/db/connect.js';
import { E2E_ENV } from '../environment.js';
import { SEEDED_CORE } from '../seed.js';
import { CRAWLED, NEEDED, STUB_BUILDS, manifestPath, stubWeb } from './stub-web.js';

import type { APIRequestContext } from '@playwright/test';
import type { StubWeb } from './stub-web.js';

const execute = promisify(execFile);

/** Runs the built worker's `drain` against the stub web. Asynchronously: the stub answers from this process. */
async function drain(web: StubWeb): Promise<void> {
  await execute('node', ['build/worker/main.js', 'drain'], {
    env: {
      ...process.env,
      ...E2E_ENV,
      FOUNDRY_INDEX_URL: `${web.base}/index-latest.json`,
      FOUNDRY_RELEASES_URL: `${web.base}/releases/`,
    },
  });
}

/** The universe of the crawled package, as the API gives it. */
async function universe(request: APIRequestContext) {
  const response = await request.post(UNIVERSE_PATH, { data: { packages: [CRAWLED] } });
  return UniverseResponse.parse(await response.json());
}

const versionsOf = (found: UniverseResponse) =>
  found.universe.releases.map(release => [release.package.id, release.version, release.detail]);

/**
 * The built worker against the database and a web that stands in for Foundry VTT's. It runs after the API's tests, as
 * its crawls change what they expect.
 */
test('the worker crawls what was asked for and what that needs, then what changed', async ({ request }) => {
  expect((await universe(request)).pending).toEqual([CRAWLED]);

  const web = await stubWeb();
  try {
    await drain(web);
    const crawled = await universe(request);
    expect(crawled.pending).toEqual([]);
    expect(versionsOf(crawled)).toEqual([
      [CRAWLED.id, '1.0.0', 'loaded'],
      [NEEDED.id, '2.0.0', 'loaded'],
    ]);
    expect(crawled.universe.releases[0]).toMatchObject({ listing: { minimum: '13', verified: '14' } });
    expect(crawled.universe.core).toEqual([...SEEDED_CORE, ...STUB_BUILDS]);

    // Its author publishes 1.1.0 today, and an hour passes: the refresh is due again.
    web.publish('1.1.0', new Date().toISOString().slice(0, 10));
    const connection = connect(E2E_ENV.DATABASE_URL);
    try {
      await connection.db.execute("delete from sync_runs where job = 'refresh'");
    } finally {
      await connection.close();
    }
    await drain(web);

    const refreshed = await universe(request);
    expect(versionsOf(refreshed)).toEqual([
      [CRAWLED.id, '1.0.0', 'loaded'],
      [CRAWLED.id, '1.1.0', 'loaded'],
      [NEEDED.id, '2.0.0', 'loaded'],
    ]);
    // Loaded once: the catalogue keeps what it loaded rather than fetching it again.
    expect(web.hits.get(manifestPath('1.0.0'))).toBe(1);
    expect(web.hits.get(manifestPath('1.1.0'))).toBe(1);
  } finally {
    await web.close();
  }
});
