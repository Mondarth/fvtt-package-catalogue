import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { LOOKUP_PATH, LookupResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { connect } from '../../../src/lib/server/db/connect.js';
import { E2E_ENV } from '../environment.js';
import { SEEDED_CORE } from '../seed.js';
import { CRAWLED, NEEDED, STUB_BUILDS, WARMED, manifestPath, stubWeb } from './stub-web.js';

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

/** A lookup of a package, the crawled one by default, and what it needs, as the API gives it. */
async function lookup(request: APIRequestContext, ref: { readonly type: 'module'; readonly id: string } = CRAWLED) {
  const response = await request.post(LOOKUP_PATH, { data: { packages: [ref] } });
  return LookupResponse.parse(await response.json());
}

/** The packages a lookup found not held yet. */
const pendingOf = (found: LookupResponse) => found.pending.map(({ package: ref }) => ref);

/** Each release a lookup gave, as its package's ID, its version and how much of it is known. */
const versionsOf = (found: LookupResponse) =>
  found.packages.flatMap(({ package: ref, releases }) =>
    releases.map(release => [ref.id, release.version, release.detail]),
  );

/**
 * The built worker against the database and a web that stands in for Foundry VTT's. It runs after the API's tests, as
 * its crawls change what they expect.
 */
test('the worker crawls what was asked for and what that needs, then what changed', async ({ request }) => {
  expect(pendingOf(await lookup(request))).toEqual([CRAWLED]);

  const web = await stubWeb();
  try {
    await drain(web);
    const crawled = await lookup(request);
    expect(pendingOf(crawled)).toEqual([]);
    expect(versionsOf(crawled)).toEqual([
      [CRAWLED.id, '1.0.0', 'loaded'],
      [NEEDED.id, '2.0.0', 'loaded'],
    ]);
    expect(crawled.packages[0]?.releases[0]).toMatchObject({ listing: { minimum: '13', verified: '14' } });
    expect(crawled.core).toEqual([...SEEDED_CORE, ...STUB_BUILDS]);
    // Warmed: held before any client asked for it, as the index lists it.
    const warmed = await lookup(request, WARMED);
    expect(pendingOf(warmed)).toEqual([]);
    expect(versionsOf(warmed)).toEqual([[WARMED.id, '0.1.0', 'loaded']]);

    // Its author publishes 1.1.0 now, and an hour passes: the refresh is due again.
    web.publish('1.1.0', new Date().toISOString());
    const connection = connect(E2E_ENV.DATABASE_URL);
    try {
      await connection.db.execute("delete from sync_runs where job = 'refresh'");
    } finally {
      await connection.close();
    }
    await drain(web);

    const refreshed = await lookup(request);
    expect(versionsOf(refreshed)).toEqual([
      [CRAWLED.id, '1.0.0', 'loaded'],
      [CRAWLED.id, '1.1.0', 'loaded'],
      [NEEDED.id, '2.0.0', 'loaded'],
    ]);
    // Loaded once: the catalogue keeps what it loaded rather than fetching it again.
    expect(web.hits.get(manifestPath('1.0.0'))).toBe(1);
    expect(web.hits.get(manifestPath('1.1.0'))).toBe(1);

    // The index is kept, as it lists the package now.
    const kept = connect(E2E_ENV.DATABASE_URL);
    try {
      const rows = await kept.db.execute(
        'select package_id, title, last_updated from listings where delisted_at is null order by package_id',
      );
      expect(rows).toEqual([
        { package_id: CRAWLED.id, title: 'E2E crawled', last_updated: expect.anything() as unknown },
        { package_id: WARMED.id, title: 'E2E warmed', last_updated: expect.anything() as unknown },
      ]);
    } finally {
      await kept.close();
    }
  } finally {
    await web.close();
  }
});
