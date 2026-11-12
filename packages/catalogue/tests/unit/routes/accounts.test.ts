import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { load as layoutLoad } from '../../../src/routes/+layout.server.js';
import { load as homeLoad } from '../../../src/routes/+page.server.js';
import { POST as deleteProfile } from '../../../src/routes/profile/delete/+server.js';
import { actions, load as profileLoad } from '../../../src/routes/profile/+page.server.js';
import { POST as signIn } from '../../../src/routes/sign-in/[provider]/+server.js';
import { POST as signOut } from '../../../src/routes/sign-out/+server.js';
import { fakeEvent, invoke } from '../support/event.js';

import type { Auth } from '../../../src/lib/server/accounts/auth.js';
import type { AccountsStore } from '../../../src/lib/server/accounts/store.js';

const USER = {
  id: 'u1',
  name: 'Test One',
  email: 'one@example.test',
  emailVerified: true,
  image: null,
  handle: 'amber-fox-oak-01',
  nickname: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const SESSION = { id: 's1', userId: 'u1' };

type LayoutEvent = Parameters<typeof layoutLoad>[0];
type HomeEvent = Parameters<typeof homeLoad>[0];
type ProfileEvent = Parameters<typeof profileLoad>[0];
type NicknameEvent = Parameters<NonNullable<typeof actions.nickname>>[0];

/** The profile page's action that sets the nickname. */
const nickname = (event: NicknameEvent) => {
  const action = actions.nickname;
  if (action === undefined) throw new Error('No nickname action');
  return action(event);
};

/** A response of Better Auth's, setting a cookie. */
function answer(body: unknown, status = 200): Response {
  const response = Response.json(body, { status });
  response.headers.append('Set-Cookie', 'better-auth.session=x');
  return response;
}

/** Better Auth, as the routes call it. */
function fakeAuth(api: Record<string, (...args: never[]) => Promise<Response>>) {
  return { api } as unknown as Auth;
}

/** What a load or action threw, which SvelteKit's redirect and error are. */
async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

describe('POST /sign-in/[provider]', () => {
  it("sends the browser to the provider, with Better Auth's cookies", async () => {
    const signInSocial = vi.fn(() => Promise.resolve(answer({ url: 'https://github.test/authorize', redirect: true })));
    const response = await invoke(signIn, {
      method: 'POST',
      params: { provider: 'github' },
      locals: { providers: ['github'], auth: fakeAuth({ signInSocial }) },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://github.test/authorize');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session=x']);
    expect(signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({ body: { provider: 'github', callbackURL: '/', errorCallbackURL: '/?error=sign-in' } }),
    );
  });

  it('refuses a provider not offered', async () => {
    const error = await thrown(() =>
      invoke(signIn, { method: 'POST', params: { provider: 'myspace' }, locals: { providers: ['github'] } }),
    );
    expect(isHttpError(error, 404)).toBe(true);
  });

  it('fails when Better Auth gives no address to go to', async () => {
    for (const given of [answer({ message: 'no' }, 400), answer({})]) {
      const error = await thrown(() =>
        invoke(signIn, {
          method: 'POST',
          params: { provider: 'github' },
          locals: { providers: ['github'], auth: fakeAuth({ signInSocial: () => Promise.resolve(given) }) },
        }),
      );
      expect(isHttpError(error, 502)).toBe(true);
    }
  });
});

describe('POST /sign-out', () => {
  it('ends the session and clears its cookie', async () => {
    const signOut_ = vi.fn(() => Promise.resolve(answer({ success: true })));
    const response = await invoke(signOut, {
      method: 'POST',
      locals: { session: SESSION as never, auth: fakeAuth({ signOut: signOut_ }) },
    });
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session=x']);
  });

  it('only goes home when no one is signed in', async () => {
    const response = await invoke(signOut, { method: 'POST', locals: { session: null } });
    expect(response.headers.get('Location')).toBe('/');
  });
});

describe('POST /profile/delete', () => {
  const post = (confirm: string | undefined, deleteUser?: () => Promise<Response>, user: unknown = USER) =>
    invoke(deleteProfile, {
      url: 'http://catalogue.test/profile/delete',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: confirm === undefined ? '' : `confirm=${confirm}`,
      locals: { user: user as never, ...(deleteUser !== undefined && { auth: fakeAuth({ deleteUser }) }) },
    });

  it('deletes the profile once the box is ticked, and goes home', async () => {
    const deleteUser = vi.fn(() => Promise.resolve(answer({ success: true })));
    const response = await post('yes', deleteUser);
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session=x']);
  });

  it('asks again when the box is not ticked', async () => {
    expect((await post(undefined)).headers.get('Location')).toBe('/profile?problem=unconfirmed');
  });

  it('asks a session over a day old to sign in again first', async () => {
    const response = await post('yes', () => Promise.resolve(answer({ code: 'SESSION_EXPIRED' }, 400)));
    expect(response.headers.get('Location')).toBe('/profile?problem=stale');
  });

  it('fails on any other refusal', async () => {
    for (const body of [{ code: 'USER_NOT_FOUND' }, {}]) {
      const error = await thrown(() => post('yes', () => Promise.resolve(answer(body, 400))));
      expect(isHttpError(error, 502)).toBe(true);
    }
  });

  it('only goes home when no one is signed in', async () => {
    expect((await post('yes', undefined, null)).headers.get('Location')).toBe('/');
  });
});

describe('the pages', () => {
  it('give every page the name the user is shown by, and nothing more', () => {
    expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: USER } }))).toEqual({ signedIn: { name: USER.handle } });
    expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: { ...USER, nickname: 'Ulenar' } } }))).toEqual({
      signedIn: { name: 'Ulenar' },
    });
    expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: null } }))).toEqual({ signedIn: null });
  });

  it('give the sign-in page its providers, and say when a sign-in failed', () => {
    const page = (user: unknown, url = 'http://catalogue.test/') =>
      homeLoad(fakeEvent<HomeEvent>({ url, locals: { user: user as never, providers: ['github'] } }));
    expect(page(null)).toEqual({ providers: ['github'], failed: false });
    expect(page(null, 'http://catalogue.test/?error=sign-in')).toEqual({ providers: ['github'], failed: true });
    expect(page(USER)).toEqual({ providers: [], failed: false });
  });
});

describe('the profile page', () => {
  const accounts = (store: Partial<AccountsStore>) => store as AccountsStore;

  it('gives the profile and what is stored, and why it was come back to', async () => {
    const linkedProviders = vi.fn(() => Promise.resolve([{ providerId: 'github', linkedAt: new Date() }]));
    const loaded = (url: string, user: object = USER) =>
      profileLoad(
        fakeEvent<ProfileEvent>({ url, locals: { user: user as never, accounts: accounts({ linkedProviders }) } }),
      );
    await expect(loaded('http://catalogue.test/profile?problem=stale&saved')).resolves.toEqual({
      profile: {
        handle: USER.handle,
        nickname: null,
        name: USER.name,
        email: USER.email,
        image: null,
        providers: ['github'],
      },
      problem: 'stale',
      saved: true,
    });
    await expect(
      loaded('http://catalogue.test/profile?problem=other', {
        ...USER,
        nickname: 'Ulenar',
        image: 'https://img.test/a.png',
      }),
    ).resolves.toMatchObject({
      profile: { nickname: 'Ulenar', image: 'https://img.test/a.png' },
      problem: null,
      saved: false,
    });
  });

  it('is the sign-in page for anyone not signed in', async () => {
    const error = await thrown(() => profileLoad(fakeEvent<ProfileEvent>({ locals: { user: null } })));
    expect(isRedirect(error) && error.location).toBe('/');
  });

  describe('setting the nickname', () => {
    const post = (
      body: string,
      setNickname = vi.fn<AccountsStore['setNickname']>(() => Promise.resolve('ok')),
      user: unknown = USER,
    ) =>
      nickname(
        fakeEvent<NicknameEvent>({
          url: 'http://catalogue.test/profile?/nickname',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          locals: { user: user as never, accounts: accounts({ setNickname }) },
        }),
      );

    it('keeps it, and comes back to the page afresh', async () => {
      const setNickname = vi.fn<AccountsStore['setNickname']>(() => Promise.resolve('ok'));
      const error = await thrown(() => post('nickname=++Ulenar++', setNickname));
      expect(isRedirect(error) && error.location).toBe('/profile?saved');
      expect(setNickname).toHaveBeenCalledWith('u1', 'Ulenar');
    });

    it('clears it when none is given', async () => {
      const setNickname = vi.fn<AccountsStore['setNickname']>(() => Promise.resolve('ok'));
      await thrown(() => post('', setNickname));
      expect(setNickname).toHaveBeenCalledWith('u1', null);
    });

    it('says why it cannot be the nickname', async () => {
      await expect(post('nickname=ab')).resolves.toMatchObject({
        status: 400,
        data: { given: 'ab', problem: 'length' },
      });
      await expect(
        post(
          'nickname=Ulenar',
          vi.fn(() => Promise.resolve('taken' as const)),
        ),
      ).resolves.toMatchObject({
        status: 400,
        data: { given: 'Ulenar', problem: 'taken' },
      });
    });

    it('is the sign-in page for anyone not signed in', async () => {
      const error = await thrown(() => post('nickname=Ulenar', undefined, null));
      expect(isRedirect(error) && error.location).toBe('/');
    });
  });
});
