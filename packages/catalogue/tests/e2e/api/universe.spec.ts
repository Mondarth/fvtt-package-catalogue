import { ErrorResponse, UNIVERSE_PATH, UniverseResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { SEEDED, SEEDED_AT, SEEDED_CORE, SEEDED_GAPS, SEEDED_RELEASES } from '../seed.js';

test('gives a universe of what it holds, and what it does not hold yet', async ({ request }) => {
  const unknown = { type: 'module', id: 'nobody-wrote-this' } as const;
  const response = await request.post(UNIVERSE_PATH, { data: { packages: [SEEDED, unknown] } });
  expect(response.status()).toBe(200);
  expect(UniverseResponse.parse(await response.json())).toEqual({
    universe: { core: SEEDED_CORE, releases: SEEDED_RELEASES },
    gaps: SEEDED_GAPS,
    // The seeded package requires lib-wrapper and runs in dnd5e, which the catalogue does not hold.
    pending: [unknown, { type: 'module', id: 'lib-wrapper' }, { type: 'system', id: 'dnd5e' }],
    asOf: SEEDED_AT.toISOString(),
  });
});

test('refuses a request that names no packages', async ({ request }) => {
  const response = await request.post(UNIVERSE_PATH, { data: { packages: [] } });
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});

test('is not got, only posted', async ({ request }) => {
  const response = await request.get(UNIVERSE_PATH);
  expect(response.status()).toBe(405);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('method-not-allowed');
});

test('lets another origin post', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '' });
  const response = await anonymous.fetch(UNIVERSE_PATH, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://foundry.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-api-key, content-type',
    },
  });
  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-methods']).toContain('POST');
  await anonymous.dispose();
});
