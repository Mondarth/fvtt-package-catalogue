import { describe, expect, it, vi } from 'vitest';

import { signedInBy } from '../../../src/lib/server/signed-in.js';
import { memoryLogger } from '../support/logger.js';

import type { Accounts, AccountUser } from '@mondarth/accounts-contract';

const USER: AccountUser = { id: 'u1', handle: 'amber-fox-oak-01', nickname: null, role: 'user', impersonated: false };

function accountsWith(answer: Accounts['userOfSession']) {
  const userOfSession = vi.fn(answer);
  return {
    accounts: { userOf: vi.fn(), userOfSession, entitlement: vi.fn(), used: vi.fn(), signOut: vi.fn() } as Accounts,
    userOfSession,
  };
}

describe('who is signed in to the website', () => {
  it('is whom the accounts say the cookies are for, by their nickname, or else their handle', async () => {
    const log = memoryLogger();
    expect(await signedInBy(accountsWith(() => Promise.resolve(USER)).accounts, 'session=c1', log)).toEqual({
      name: 'amber-fox-oak-01',
      admin: false,
      impersonated: false,
    });
    const admin = { ...USER, nickname: 'Ulenar', role: 'admin', impersonated: true } as const;
    expect(await signedInBy(accountsWith(() => Promise.resolve(admin)).accounts, 'session=c1', log)).toEqual({
      name: 'Ulenar',
      admin: true,
      impersonated: true,
    });
  });

  it('is no one by cookies of no session, without cookies, or without the accounts', async () => {
    const log = memoryLogger();
    const none = accountsWith(() => Promise.resolve(undefined));
    expect(await signedInBy(none.accounts, 'session=gone', log)).toBeNull();
    expect(await signedInBy(none.accounts, null, log)).toBeNull();
    expect(await signedInBy(none.accounts, '', log)).toBeNull();
    expect(none.userOfSession).toHaveBeenCalledOnce();
    expect(await signedInBy(undefined, 'session=c1', log)).toBeNull();
  });

  it('is no one, logged, should the accounts not answer', async () => {
    const log = memoryLogger();
    const down = accountsWith(() => Promise.reject(new Error('down')));
    expect(await signedInBy(down.accounts, 'session=c1', log)).toBeNull();
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: 'warn', message: 'The accounts could not say who is signed in' }),
    );
  });
});
