import { ErrorResponse, MeResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { expect, test } from '@playwright/test';

import { E2E_MODULE_KEY, E2E_TOKENS } from '../environment.js';

import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

/** A client of its own, sending only the headers given: no key, unless one is. */
async function client(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  headers: Record<string, string>,
): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: baseURL ?? '', extraHTTPHeaders: headers });
}

const LOOKUP = { packages: [{ type: 'module', id: 'e2e-module' }] };

test.describe("a module's key", () => {
  test('reaches lookups, what the module calls', async ({ playwright, baseURL }) => {
    const module = await client(playwright, baseURL, { 'X-API-Key': E2E_MODULE_KEY });
    expect((await module.post('/api/v2/lookup', { data: LOOKUP })).status()).toBe(200);
    await module.dispose();
  });

  test('is forbidden the rest', async ({ playwright, baseURL }) => {
    const module = await client(playwright, baseURL, { 'X-API-Key': E2E_MODULE_KEY });
    for (const response of [
      await module.get('/api/v2/listing'),
      await module.get('/api/v2/core'),
      await module.post('/api/v2/manifest', { data: { url: 'https://example.test/module.json', type: 'module' } }),
      await module.get('/api/v2/status'),
      await module.post('/api/v2/recheck', { data: { packages: [] } }),
      await module.get('/api/v2/me'),
    ]) {
      expect(response.status()).toBe(403);
      expect(ErrorResponse.parse(await response.json()).error.code).toBe('forbidden');
    }
    await module.dispose();
  });
});

test.describe("a user's token", () => {
  test("is a subscriber's, reaching every endpoint, and says whose", async ({ playwright, baseURL }) => {
    const user = await client(playwright, baseURL, { Authorization: `Bearer ${E2E_TOKENS.subscriber}` });
    expect((await user.get('/api/v2/status')).status()).toBe(200);
    expect((await user.post('/api/v2/lookup', { data: LOOKUP })).status()).toBe(200);
    const me = MeResponse.parse(await (await user.get('/api/v2/me')).json());
    expect(me).toMatchObject({ user: { handle: 'e2e-subscriber-handle', role: 'user' }, entitled: true });
    expect(me.subscription.active).toBe(true);
    await user.dispose();
  });

  test('is refused without a subscription, saying when it ended, but for /me', async ({ playwright, baseURL }) => {
    const user = await client(playwright, baseURL, { Authorization: `Bearer ${E2E_TOKENS.lapsed}` });
    const refused = await user.post('/api/v2/lookup', { data: LOOKUP });
    expect(refused.status()).toBe(403);
    const { error } = ErrorResponse.parse(await refused.json());
    expect(error.code).toBe('subscription-required');
    expect(Date.parse(error.paidUntil ?? '')).toBeLessThan(Date.now());
    const me = MeResponse.parse(await (await user.get('/api/v2/me')).json());
    expect(me).toMatchObject({ entitled: false, subscription: { active: false } });
    await user.dispose();
  });

  test("is an admin's, reaching every endpoint whether subscribed or not", async ({ playwright, baseURL }) => {
    const admin = await client(playwright, baseURL, { Authorization: `Bearer ${E2E_TOKENS.admin}` });
    expect((await admin.get('/api/v2/status')).status()).toBe(200);
    expect(MeResponse.parse(await (await admin.get('/api/v2/me')).json())).toMatchObject({
      user: { role: 'admin' },
      entitled: true,
    });
    await admin.dispose();
  });

  test('is refused when no session has it, and the session cookie is never one', async ({ playwright, baseURL }) => {
    const unknown = await client(playwright, baseURL, { Authorization: 'Bearer nosuchtoken' });
    expect((await unknown.get('/api/v2/status')).status()).toBe(401);
    await unknown.dispose();
    const cookie = await client(playwright, baseURL, {
      Cookie: `better-auth.session_token=${E2E_TOKENS.subscriber}`,
    });
    const response = await cookie.get('/api/v2/status');
    expect(response.status()).toBe(401);
    expect(ErrorResponse.parse(await response.json()).error.code).toBe('unauthorised');
    await cookie.dispose();
  });

  test('may be sent from any origin', async ({ playwright, baseURL }) => {
    const anonymous = await client(playwright, baseURL, {});
    const response = await anonymous.fetch('/api/v2/me', {
      method: 'OPTIONS',
      headers: { Origin: 'https://foundry.example.com', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(response.headers()['access-control-allow-headers']).toMatch(/Authorization/);
    await anonymous.dispose();
  });
});
