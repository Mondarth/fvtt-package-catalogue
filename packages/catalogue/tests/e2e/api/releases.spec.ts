import { ErrorResponse, ReleasesResponse, releasesPath } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '../fixtures.js';
import { SEEDED, SEEDED_AT, SEEDED_RELEASES } from '../seed.js';

test("gives a package's releases as they were saved", async ({ request }) => {
  const response = await request.get(releasesPath(SEEDED));
  expect(response.status()).toBe(200);
  expect(ReleasesResponse.parse(await response.json())).toEqual({
    package: SEEDED,
    releases: SEEDED_RELEASES,
    asOf: SEEDED_AT.toISOString(),
  });
});

test('says when it does not know a package', async ({ request }) => {
  const response = await request.get(releasesPath({ type: 'module', id: 'nobody-wrote-this' }));
  expect(response.status()).toBe(404);
  expect(ErrorResponse.parse(await response.json()).error).toMatchObject({ code: 'not-found' });
});

test('refuses an id no package can have', async ({ request }) => {
  const response = await request.get('/api/v1/packages/module/a%2Fb/releases');
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});
