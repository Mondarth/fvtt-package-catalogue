import { ErrorResponse, MANIFEST_PATH, ManifestResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';

test('refuses to fetch what only the server can reach', async ({ request }) => {
  for (const url of [
    'http://127.0.0.1/module.json',
    'http://localhost/module.json',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/module.json',
    'http://example.com:5432/module.json',
  ]) {
    const response = await request.post(MANIFEST_PATH, { data: { url, type: 'module' } });
    expect(response.status()).toBe(200);
    expect(ManifestResponse.parse(await response.json())).toMatchObject({
      ok: false,
      problem: 'unreadable',
      reason: 'refused',
    });
  }
});

test('refuses a URL that is not of the web', async ({ request }) => {
  const response = await request.post(MANIFEST_PATH, { data: { url: 'file:///etc/passwd', type: 'module' } });
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});
