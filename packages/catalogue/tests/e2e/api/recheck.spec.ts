import { ErrorResponse, RECHECK_PATH, RecheckResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';

test('leaves out packages it does not hold', async ({ request }) => {
  const response = await request.post(RECHECK_PATH, {
    data: { packages: [{ type: 'module', id: 'nobody-holds-this' }] },
  });
  expect(response.status()).toBe(200);
  expect(RecheckResponse.parse(await response.json())).toEqual({ packages: [], pending: [] });
});

test('refuses more packages than a user means to see fresh', async ({ request }) => {
  const packages = Array.from({ length: 51 }, (_, index) => ({ type: 'module', id: `pkg-${String(index)}` }));
  const response = await request.post(RECHECK_PATH, { data: { packages } });
  expect(response.status()).toBe(400);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe('bad-request');
});
