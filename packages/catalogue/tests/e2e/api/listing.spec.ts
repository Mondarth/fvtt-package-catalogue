import {
  CORE_PATH,
  CoreResponse,
  ErrorResponse,
  LISTING_PATH,
  ListingResponse,
} from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';
import { SEEDED_CORE } from '../seed.js';

test('gives the listing with an ETag, and 304 to a client that has it', async ({ request }) => {
  const response = await request.get(`${LISTING_PATH}?type=module`);
  expect(response.status()).toBe(200);
  expect(ListingResponse.parse(await response.json()).packages).toEqual(expect.any(Array));
  const etag = response.headers().etag ?? '';
  expect(etag).toMatch(/^"listing-module-/);
  expect(response.headers()['cache-control']).toContain('max-age=300');
  const again = await request.get(`${LISTING_PATH}?type=module`, { headers: { 'If-None-Match': etag } });
  expect(again.status()).toBe(304);
  expect(again.headers()['access-control-allow-origin']).toBe('*');
});

test('refuses a type the listing does not offer', async ({ request }) => {
  const response = await request.get(`${LISTING_PATH}?type=world`);
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});

test("gives Foundry VTT's builds with an ETag, and 304 to a client that has them", async ({ request }) => {
  const response = await request.get(CORE_PATH);
  expect(CoreResponse.parse(await response.json()).core).toEqual(SEEDED_CORE);
  const again = await request.get(CORE_PATH, { headers: { 'If-None-Match': response.headers().etag ?? '' } });
  expect(again.status()).toBe(304);
});

test('lets another origin revalidate, and read the ETag', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '', extraHTTPHeaders: {} });
  const response = await anonymous.fetch(LISTING_PATH, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://foundry.example.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-api-key, if-none-match',
    },
  });
  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-headers']).toContain('If-None-Match');
  expect(response.headers()['access-control-expose-headers']).toBe('ETag');
  await anonymous.dispose();
});
