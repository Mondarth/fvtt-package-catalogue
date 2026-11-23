import { INTERNAL_KEY_HEADER, INTERNAL_PATHS, entitlementSchema } from '@mondarth/accounts-contract';
import { expect, test } from '@playwright/test';

import { E2E_INTERNAL_KEY, E2E_TOKENS } from '../environment.js';

const KEY = { [INTERNAL_KEY_HEADER]: E2E_INTERNAL_KEY };

test('tells an application who a token is for, and what they are entitled to', async ({ request }) => {
  const asked = await request.post(INTERNAL_PATHS.tokenUser, { headers: KEY, data: { token: E2E_TOKENS.subscriber } });
  expect(asked.status()).toBe(200);
  const { user } = (await asked.json()) as { user: Record<string, unknown> };
  expect(user).toMatchObject({ id: 'e2e-subscriber', handle: 'e2e-subscriber-handle', role: 'user' });

  const entitled = await request.post(INTERNAL_PATHS.entitlement, { headers: KEY, data: { user } });
  expect(entitlementSchema.parse(await entitled.json())).toMatchObject({ active: true, entitled: true });
  const lapsed = (await (
    await request.post(INTERNAL_PATHS.tokenUser, { headers: KEY, data: { token: E2E_TOKENS.lapsed } })
  ).json()) as { user: Record<string, unknown> };
  const ended = await request.post(INTERNAL_PATHS.entitlement, { headers: KEY, data: { user: lapsed.user } });
  expect(entitlementSchema.parse(await ended.json())).toMatchObject({ active: false, entitled: false });
});

test('tells of no one for a token of no session, or cookies of none', async ({ request }) => {
  const token = await request.post(INTERNAL_PATHS.tokenUser, { headers: KEY, data: { token: 'nosuchtoken' } });
  expect(await token.json()).toEqual({ user: null });
  const cookie = await request.post(INTERNAL_PATHS.sessionUser, { headers: KEY, data: { cookie: 'session=none' } });
  expect(await cookie.json()).toEqual({ user: null });
});

test('takes a use of a service, with no content', async ({ request }) => {
  const asked = await request.post(INTERNAL_PATHS.tokenUser, { headers: KEY, data: { token: E2E_TOKENS.subscriber } });
  const { user } = (await asked.json()) as { user: unknown };
  const use = { kind: 'api', path: '/api/v2/lookup', client: 'e2e', ipAddress: '203.0.113.7', userAgent: null };
  expect((await request.post(INTERNAL_PATHS.use, { headers: KEY, data: { user, use } })).status()).toBe(204);
});

test('refuses an application without its key', async ({ request }) => {
  const refused = await request.post(INTERNAL_PATHS.tokenUser, { data: { token: E2E_TOKENS.subscriber } });
  expect(refused.status()).toBe(401);
});
