import { describe, expect, it, vi } from 'vitest';

import { createAccountsHandle, isAuthPath } from '../../../../src/lib/server/accounts/handle.js';
import { fakeEvent } from '../../support/event.js';

import type { RequestEvent } from '@sveltejs/kit';
import type { Auth } from '../../../../src/lib/server/accounts/auth.js';
import type { AccountsStore } from '../../../../src/lib/server/accounts/store.js';

const USER = { id: 'u1', handle: 'amber-fox-oak-01' };
const SESSION = { id: 's1', userId: 'u1' };

function setUp(found: { user: typeof USER; session: typeof SESSION } | null) {
  const cookies = new Headers();
  cookies.append('Set-Cookie', 'session=renewed');
  const auth = {
    handler: vi.fn(() => Promise.resolve(new Response('from Better Auth'))),
    api: { getSession: vi.fn(() => Promise.resolve({ headers: cookies, response: found })) },
  };
  const accounts = {} as AccountsStore;
  const handle = createAccountsHandle(auth as unknown as Auth, accounts, ['github']);
  const resolve = vi.fn<(event: RequestEvent) => Promise<Response>>(() => Promise.resolve(new Response('page')));
  const run = (path: string) => {
    const event = fakeEvent({ url: `http://catalogue.test${path}` });
    return { event, response: Promise.resolve(handle({ event, resolve })) };
  };
  return { auth, accounts, resolve, run };
}

describe('isAuthPath', () => {
  it("is Better Auth's paths alone", () => {
    expect(isAuthPath('/auth')).toBe(true);
    expect(isAuthPath('/auth/callback/github')).toBe(true);
    expect(isAuthPath('/authors')).toBe(false);
    expect(isAuthPath('/')).toBe(false);
  });
});

describe('createAccountsHandle', () => {
  it('lets Better Auth answer its own paths', async () => {
    const { auth, resolve, run } = setUp(null);
    const { response } = run('/auth/callback/github');
    expect(await (await response).text()).toBe('from Better Auth');
    expect(auth.handler).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('passes the API and the health check through, not signed in to', async () => {
    const { auth, resolve, run } = setUp(null);
    for (const path of ['/api/v2/status', '/healthz']) {
      const { event, response } = run(path);
      await response;
      expect(event.locals.user).toBeNull();
    }
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('gives each page who is signed in, and sets the cookie again where reading the session renewed it', async () => {
    const { accounts, run } = setUp({ user: USER, session: SESSION });
    const { event, response } = run('/profile');
    const answered = await response;
    expect(event.locals).toMatchObject({ user: USER, session: SESSION, accounts, providers: ['github'] });
    expect(answered.headers.getSetCookie()).toEqual(['session=renewed']);
  });

  it('gives each page no one, when no one is signed in', async () => {
    const { run } = setUp(null);
    const { event, response } = run('/');
    await response;
    expect(event.locals.user).toBeNull();
    expect(event.locals.session).toBeNull();
  });
});
