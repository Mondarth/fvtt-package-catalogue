import { ErrorResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';

test.describe('without a valid key', () => {
  for (const [label, headers] of [
    ['no key', {}],
    ['a wrong key', { 'X-API-Key': 'guess' }],
  ] as const) {
    test(`the API refuses ${label}, readably from any origin`, async ({ playwright, baseURL }) => {
      const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '', extraHTTPHeaders: headers });
      const response = await anonymous.get('/api/v1/status');
      expect(response.status()).toBe(401);
      expect(response.headers()['access-control-allow-origin']).toBe('*');
      expect(ErrorResponse.parse(await response.json()).error.code).toBe('unauthorised');
      await anonymous.dispose();
    });
  }
});

test('a key being rotated out is still accepted', async ({ request }) => {
  const response = await request.get('/api/v1/status', { headers: { 'X-API-Key': 'e2e-previous-key' } });
  expect(response.status()).toBe(200);
});

test('the CORS preflight needs no key', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '' });
  const response = await anonymous.fetch('/api/v1/status', {
    method: 'OPTIONS',
    headers: { Origin: 'https://foundry.example.com', 'Access-Control-Request-Headers': 'x-api-key' },
  });
  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-headers']).toContain('X-API-Key');
  await anonymous.dispose();
});

test('a path no endpoint has gets the contract’s error, not a web page', async ({ request }) => {
  const response = await request.get('/api/v1/packages/theme/anything/releases');
  expect(response.status()).toBe(404);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('not-found');
});
