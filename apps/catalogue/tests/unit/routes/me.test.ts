import { describe, expect, it } from 'vitest';

import { GET } from '../../../src/routes/api/v2/me/+server.js';
import { invoke } from '../support/event.js';

import type { ApiCaller } from '../../../src/lib/server/http/handle.js';

const USER = { id: 'u1', handle: 'amber-fox-oak-01', nickname: 'Ada', role: 'admin' as const, impersonated: false };

describe('GET /api/v2/me', () => {
  const me = (caller: ApiCaller | undefined) => invoke(GET, { locals: caller === undefined ? {} : { caller } });

  it('says who a token is for, their subscription and whether they may use the API', async () => {
    const response = await me({
      kind: 'user',
      user: USER,
      entitlement: { paidUntil: new Date('2027-01-01T00:00:00Z'), active: false, patreon: false, entitled: true },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { handle: 'amber-fox-oak-01', nickname: 'Ada', role: 'admin' },
      subscription: { paidUntil: '2027-01-01T00:00:00.000Z', active: false, patreon: false },
      entitled: true,
    });
  });

  it('says a user who never subscribed has no subscription', async () => {
    const response = await me({
      kind: 'user',
      user: { ...USER, nickname: null, role: 'user' },
      entitlement: { paidUntil: null, active: false, patreon: false, entitled: false },
    });
    expect(await response.json()).toMatchObject({ subscription: { paidUntil: null }, entitled: false });
  });

  it('is forbidden to a key, or anyone the handle did not let through', async () => {
    for (const caller of [{ kind: 'full' } as const, undefined]) {
      const response = await me(caller);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } });
    }
  });
});
