import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/+layout.server.js';
import { fakeEvent } from '../support/event.js';

import type { Accounts } from '@mondarth/accounts-contract';
import type { LayoutServerLoadEvent } from '../../../src/routes/$types.js';

describe('every page', () => {
  it('is given who is signed in, by the accounts, and where the accounts are', async () => {
    const userOfSession = vi.fn<Accounts['userOfSession']>(() =>
      Promise.resolve({ id: 'u1', handle: 'h', nickname: 'Ulenar', role: 'user', impersonated: false }),
    );
    const accounts = { userOfSession } as unknown as Accounts;
    const event = fakeEvent<LayoutServerLoadEvent>({
      headers: { Cookie: 'session=c1' },
      locals: { accounts, accountsSite: 'https://accounts.example.org' },
    });
    expect(await load(event)).toEqual({
      signedIn: { name: 'Ulenar', admin: false, impersonated: false },
      accountsSite: 'https://accounts.example.org',
    });
    expect(userOfSession).toHaveBeenCalledWith('session=c1');
  });

  it('is shown to no one signed in, without the accounts', async () => {
    expect(await load(fakeEvent<LayoutServerLoadEvent>())).toEqual({
      signedIn: null,
      accountsSite: '',
    });
  });
});
