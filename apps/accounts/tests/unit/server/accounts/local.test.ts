import { describe, expect, it, vi } from 'vitest';

import { localAccounts } from '../../../../src/lib/server/accounts/local.js';

import type { FoundSession } from '../../../../src/lib/server/accounts/local.js';

const ENTITLED = { paidUntil: null, active: false, patreon: false, entitled: true };
const USE = { kind: 'api', path: '/api/v2/lookup', client: 'api', ipAddress: '203.0.113.7', userAgent: null } as const;

function setUp(found: Record<string, FoundSession> = {}) {
  const access = { seen: vi.fn(() => Promise.resolve()), record: vi.fn(() => Promise.resolve()) };
  const entitlement = vi.fn(() => Promise.resolve(ENTITLED));
  const endSession = vi.fn((headers: Headers) => Promise.resolve([`cleared; was ${headers.get('cookie') ?? ''}`]));
  const accounts = localAccounts({
    sessionOf: headers => {
      // A bearer token, or the cookies, alone.
      const given = headers.get('authorization')?.replace(/^Bearer /, '') ?? `cookie:${headers.get('cookie') ?? ''}`;
      return Promise.resolve(found[given] ?? null);
    },
    isAdmin: user => user.role === 'admin' || user.id === 'named',
    entitlement,
    access,
    endSession,
  });
  return { accounts, access, entitlement, endSession };
}

describe('the accounts, served in the catalogue', () => {
  it('know who a token is for by its session, an admin by role or by name, the admin viewing as a user marked', async () => {
    const { accounts } = setUp({
      t1: { user: { id: 'u1', handle: 'amber-fox-oak-01' }, session: { id: 's1' } },
      t2: {
        user: { id: 'u2', handle: 'h2', nickname: 'Ulenar', role: 'admin' },
        session: { id: 's2', impersonatedBy: null },
      },
      t3: { user: { id: 'named', handle: 'h3', nickname: null }, session: { id: 's3', impersonatedBy: 'admin' } },
    });
    expect(await accounts.userOf('t1')).toEqual({
      id: 'u1',
      handle: 'amber-fox-oak-01',
      nickname: null,
      role: 'user',
      impersonated: false,
      sessionId: 's1',
    });
    expect(await accounts.userOf('t2')).toMatchObject({ nickname: 'Ulenar', role: 'admin', impersonated: false });
    expect(await accounts.userOf('t3')).toMatchObject({ role: 'admin', impersonated: true });
    expect(await accounts.userOf('none')).toBeUndefined();
  });

  it('know who is signed in to the website by its cookies, and no one by cookies of no session', async () => {
    const { accounts } = setUp({
      'cookie:session=c1': { user: { id: 'u1', handle: 'amber-fox-oak-01' }, session: { id: 's1' } },
    });
    expect(await accounts.userOfSession('session=c1')).toMatchObject({ id: 'u1', sessionId: 's1' });
    expect(await accounts.userOfSession('session=other')).toBeUndefined();
  });

  it('tell what a subscription entitles its user to', async () => {
    const { accounts, entitlement } = setUp();
    const user = { id: 'u1', handle: 'h', nickname: null, role: 'user', impersonated: false } as const;
    expect(await accounts.entitlement(user)).toBe(ENTITLED);
    expect(entitlement).toHaveBeenCalledWith(user);
  });

  it("keep a user's last session from their use, record it while they dispute a payment, and ignore an admin's viewing", async () => {
    const { accounts, access } = setUp();
    const user = { id: 'u1', handle: 'h', nickname: null, role: 'user', impersonated: false } as const;
    await accounts.used({ ...user, sessionId: 's1' }, USE);
    expect(access.seen).toHaveBeenCalledWith('u1', 's1', USE);
    expect(access.record).toHaveBeenCalledWith('u1', USE);

    // A token whose session the accounts do not name keeps no last session.
    access.seen.mockClear();
    await accounts.used(user, USE);
    expect(access.seen).not.toHaveBeenCalled();
    expect(access.record).toHaveBeenCalledTimes(2);

    access.record.mockClear();
    await accounts.used({ ...user, impersonated: true, sessionId: 's1' }, USE);
    expect(access.seen).not.toHaveBeenCalled();
    expect(access.record).not.toHaveBeenCalled();
  });
});

describe("signing out, by the website's cookie", () => {
  it('ends the session the cookie names, by the cookie alone, and gives what clears it', async () => {
    const { accounts, endSession } = setUp({
      'cookie:session=c1': { user: { id: 'u1', handle: 'h' }, session: { id: 's1' } },
    });
    expect(await accounts.signOut('session=c1')).toEqual(['cleared; was session=c1']);
    const [headers] = endSession.mock.calls[0] ?? [];
    expect([...(headers?.keys() ?? [])]).toEqual(['cookie']);
  });

  it('ends nothing, and clears nothing, for cookies that name no session', async () => {
    const { accounts, endSession } = setUp();
    expect(await accounts.signOut('other=1')).toEqual([]);
    expect(endSession).not.toHaveBeenCalled();
  });
});
