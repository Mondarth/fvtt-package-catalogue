import { HealthResponse, StatusResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { SEEDED_AT, SEEDED_RELEASES } from '../seed.js';

test('the server says it is up, without a key', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '' });
  const response = await anonymous.get('/healthz');
  expect(response.status()).toBe(200);
  expect(HealthResponse.parse(await response.json())).toEqual({ status: 'ok' });
  await anonymous.dispose();
});

test('the status gives what the catalogue holds', async ({ request }) => {
  const response = await request.get('/api/v1/status');
  expect(response.status()).toBe(200);
  expect(StatusResponse.parse(await response.json())).toMatchObject({
    apiVersion: 'v1',
    packages: 1,
    releases: SEEDED_RELEASES.length,
    asOf: SEEDED_AT.toISOString(),
  });
});
