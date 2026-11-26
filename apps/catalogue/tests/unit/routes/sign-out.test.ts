import { describe, expect, it, vi } from 'vitest';

import { POST } from '../../../src/routes/sign-out/+server.js';
import { fakeEvent } from '../support/event.js';

import type { Accounts } from '@mondarth/accounts-contract';

const CLEARED = 'session=; Domain=.mondarth.test; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

/** The sign-out, posted, with the accounts and the request's cookies given. */
function signOut(accounts: Pick<Accounts, 'signOut'> | undefined, cookie?: string) {
  const event = fakeEvent({
    url: 'http://catalogue.test/sign-out',
    method: 'POST',
    ...(cookie !== undefined && { headers: { Cookie: cookie } }),
    locals: accounts === undefined ? {} : { accounts: accounts as Accounts },
  });
  return { event, response: POST(event as never) };
}

describe('signing out, from the catalogue', () => {
  it('has the accounts end the session, sends what clears its cookie, and sends the visitor home', async () => {
    const accounts = { signOut: vi.fn<Accounts['signOut']>(() => Promise.resolve([CLEARED, 'other=; Max-Age=0'])) };
    const response = await signOut(accounts, 'session=c1; theme=dark').response;
    expect(accounts.signOut).toHaveBeenCalledWith('session=c1; theme=dark');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.getSetCookie()).toEqual([CLEARED, 'other=; Max-Age=0']);
  });

  it('sends home, asking nothing, a visitor with no cookie, or where the catalogue has no accounts', async () => {
    const accounts = { signOut: vi.fn<Accounts['signOut']>() };
    for (const response of [await signOut(accounts).response, await signOut(accounts, '').response]) {
      expect(response.status).toBe(303);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(accounts.signOut).not.toHaveBeenCalled();
    expect((await signOut(undefined, 'session=c1').response).headers.get('location')).toBe('/');
  });

  it('sends home, still signed in, should the accounts not answer, and logs it', async () => {
    const accounts = { signOut: vi.fn<Accounts['signOut']>(() => Promise.reject(new Error('down'))) };
    const { event, response } = signOut(accounts, 'session=c1');
    const answered = await response;
    expect(answered.status).toBe(303);
    expect(answered.headers.getSetCookie()).toEqual([]);
    expect(JSON.stringify(event.locals.log)).toContain('The accounts could not sign out');
  });
});
