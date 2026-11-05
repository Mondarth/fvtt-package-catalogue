import { ErrorResponse, LOOKUP_PATH, LookupResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { SEEDED, SEEDED_AT, SEEDED_CORE, SEEDED_RELEASES } from '../seed.js';

test('gives each package once with its releases, and what it does not hold yet', async ({ request }) => {
  const unknown = { type: 'module', id: 'nobody-wrote-this-either' } as const;
  const response = await request.post(LOOKUP_PATH, {
    data: { packages: [SEEDED, { ...unknown, manifest: 'https://example.com/nobody/module.json' }] },
  });
  expect(response.status()).toBe(200);
  const found = LookupResponse.parse(await response.json());
  expect(found.core).toEqual(SEEDED_CORE);
  expect(found.packages.map(pkg => pkg.package)).toEqual([SEEDED]);
  expect(found.packages[0]?.releases.map(release => release.version)).toEqual(
    SEEDED_RELEASES.map(release => release.version),
  );
  expect(found.packages[0]?.syncedAt).toBe(SEEDED_AT.toISOString());
  // The seeded package requires lib-wrapper and runs in dnd5e, which the catalogue does not hold.
  expect(found.pending.map(pending => pending.package)).toEqual([
    unknown,
    { type: 'module', id: 'lib-wrapper' },
    { type: 'system', id: 'dnd5e' },
  ]);
  expect(found.asOf).toBe(SEEDED_AT.toISOString());
});

test('keeps releases that declare no maximum, from any generation', async ({ request }) => {
  // 1.0.0 declares no maximum, so may run on any build: asked from a later generation, both are given.
  const response = await request.post(LOOKUP_PATH, { data: { packages: [SEEDED], fromGeneration: 99 } });
  const found = LookupResponse.parse(await response.json());
  expect(found.packages[0]?.releases.map(release => release.version)).toEqual(['1.0.0', '1.1.0']);
});

test('refuses a request that names no packages', async ({ request }) => {
  const response = await request.post(LOOKUP_PATH, { data: { packages: [] } });
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});

test('needs a key, as version 1 does', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '' });
  const response = await anonymous.post(LOOKUP_PATH, { data: { packages: [SEEDED] } });
  expect(response.status()).toBe(401);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('unauthorised');
  await anonymous.dispose();
});

test('answers a path no version has as the API, not the website', async ({ request }) => {
  const response = await request.get('/api/v9/nothing');
  expect(response.status()).toBe(404);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('not-found');
});
