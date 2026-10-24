import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { UNIVERSE_PATH, UniverseResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { E2E_ENV } from '../environment.js';
import { SEEDED_CORE } from '../seed.js';
import { CRAWLED, NEEDED, STUB_BUILDS, stubWeb } from './stub-web.js';

const run = promisify(execFile);

/**
 * The built worker against the database and a web that stands in for Foundry VTT's: what a client asks for and the
 * catalogue does not hold is crawled, and so is what it needs. It runs after the API's tests, as its crawl changes
 * what they expect.
 */
test('the worker crawls what was asked for, and what that needs', async ({ request }) => {
  const asked = { data: { packages: [CRAWLED] } };
  const before = UniverseResponse.parse(await (await request.post(UNIVERSE_PATH, asked)).json());
  expect(before.pending).toEqual([CRAWLED]);

  const web = await stubWeb();
  try {
    // Asynchronously: the stub answers from this process while the worker runs.
    await run('node', ['build/worker/main.js', 'drain'], {
      env: {
        ...process.env,
        ...E2E_ENV,
        FOUNDRY_INDEX_URL: `${web.base}/index-latest.json`,
        FOUNDRY_RELEASES_URL: `${web.base}/releases/`,
      },
    });
  } finally {
    await web.close();
  }

  const after = UniverseResponse.parse(await (await request.post(UNIVERSE_PATH, asked)).json());
  expect(after.pending).toEqual([]);
  expect(after.universe.releases.map(release => [release.package.id, release.version, release.detail])).toEqual([
    [CRAWLED.id, '1.0.0', 'loaded'],
    [NEEDED.id, '2.0.0', 'loaded'],
  ]);
  expect(after.universe.releases[0]).toMatchObject({ listing: { minimum: '13', verified: '14' } });
  expect(after.universe.core).toEqual([...SEEDED_CORE, ...STUB_BUILDS]);
  expect(after.asOf).not.toBeNull();
});
