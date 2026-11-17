import { MeResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** A user's name with the provider, unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/** The codes a device is given, as EMMA's browser extension asks for them. */
async function codes(request: APIRequestContext): Promise<{ device_code: string; user_code: string }> {
  const response = await request.post('/auth/device/code', { data: { client_id: 'emma-extension' } });
  expect(response.status()).toBe(200);
  return (await response.json()) as { device_code: string; user_code: string };
}

/** What polling for the token gives. */
async function poll(
  request: APIRequestContext,
  deviceCode: string,
): Promise<{ access_token?: string; error?: string }> {
  const response = await request.post('/auth/device/token', {
    data: { grant_type: GRANT, device_code: deviceCode, client_id: 'emma-extension' },
  });
  return (await response.json()) as { access_token?: string; error?: string };
}

/** Opens the page the device sends its user to, and signs in there as a user the stand-in provider knows by name. */
async function openSignedIn(page: Page, userCode: string, name: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto(`/device?user_code=${userCode}`);
  await expect(page.getByText(en.device_sign_in_first)).toBeVisible();
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
}

test('a device is approved, given a token the API takes, and signed out from the profile', async ({
  page,
  request,
}, info) => {
  const given = await codes(request);
  expect(await poll(request, given.device_code)).toMatchObject({ error: 'authorization_pending' });

  // Signing in from the page comes back to it, with the code.
  await openSignedIn(page, given.user_code, nameFor('fran', info));
  await expect(page.getByRole('heading', { level: 1, name: en.device_heading })).toBeVisible();
  await expect(page.getByText(en.device_confirm.replace('{client}', en.device_client_emma_extension))).toBeVisible();
  await expect(page.getByText(given.user_code)).toBeVisible();
  await page.getByRole('button', { name: en.device_approve }).click();
  await expect(page.getByRole('status')).toHaveText(en.device_approved);

  // The device polls again, once its interval has passed, and is given its token.
  await page.waitForTimeout(5_500);
  const { access_token: token } = await poll(request, given.device_code);
  expect(token).toBeTruthy();
  const me = await request.get('/api/v2/me', { headers: { Authorization: `Bearer ${token ?? ''}` } });
  expect(me.status()).toBe(200);
  expect(MeResponse.parse(await me.json())).toMatchObject({ entitled: false, subscription: { active: false } });

  // The profile lists it, by its client, and signs it out.
  await page.goto('/profile');
  const devices = page.getByRole('region', { name: en.devices_heading });
  const extension = devices.getByRole('listitem').filter({ hasText: en.device_client_emma_extension });
  await expect(extension).toBeVisible();
  await expect(devices.getByRole('listitem').filter({ hasText: en.devices_this })).toBeVisible();
  await extension.getByRole('button', { name: /^Sign out: / }).click();
  await expect(page.getByRole('status').filter({ hasText: en.devices_signed_out })).toBeVisible();
  await expect(devices.getByRole('listitem').filter({ hasText: en.device_client_emma_extension })).toHaveCount(0);
  const after = await request.get('/api/v2/me', { headers: { Authorization: `Bearer ${token ?? ''}` } });
  expect(after.status()).toBe(401);
});

test('a device denied is given no token', async ({ page, request }, info) => {
  const given = await codes(request);
  await openSignedIn(page, given.user_code, nameFor('gil', info));
  await page.getByRole('button', { name: en.device_deny }).click();
  await expect(page.getByRole('status')).toHaveText(en.device_denied);
  expect(await poll(request, given.device_code)).toMatchObject({ error: 'access_denied' });
});

test('a code no device is waiting with is said to be so', async ({ page }, info) => {
  await openSignedIn(page, 'NOSUCHCD', nameFor('hal', info));
  await expect(page.getByRole('alert')).toHaveText(en.device_unknown);
  await expect(page.getByRole('button', { name: en.device_approve })).toHaveCount(0);
});
