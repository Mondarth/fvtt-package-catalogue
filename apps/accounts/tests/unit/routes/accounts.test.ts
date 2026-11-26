import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { load as layoutLoad } from '../../../src/routes/+layout.server.js';
import { load as homeLoad } from '../../../src/routes/+page.server.js';
import { POST as deleteProfile } from '../../../src/routes/profile/delete/+server.js';
import { actions, load as profileLoad } from '../../../src/routes/profile/+page.server.js';
import { POST as signIn } from '../../../src/routes/sign-in/[provider]/+server.js';
import { GET as goBack } from '../../../src/routes/return/+server.js';
import { POST as signOut } from '../../../src/routes/sign-out/+server.js';
import { fakeEvent, invoke } from '../support/event.js';

import { banNotices } from '../../../src/lib/server/accounts/ban-notice.js';

import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';
import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { Auth } from '../../../src/lib/server/accounts/auth.js';
import type { AccountsStore, UserDetail } from '../../../src/lib/server/accounts/store.js';

const USER = {
  id: 'u1',
  name: 'Test One',
  email: 'one@example.test',
  emailVerified: true,
  image: null,
  handle: 'amber-fox-oak-01',
  nickname: null,
  role: 'user',
  banned: false,
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

/** Subscriptions with the credits given, as the profile's deletion asks them. */
const creditsOf = (credits: object[] = []) =>
  ({ history: () => Promise.resolve(credits) }) as unknown as SubscriptionStore;

describe('POST /profile/delete', () => {
  const post = (
    confirm: string | undefined,
    deleteUser?: () => Promise<Response>,
    user: unknown = USER,
    credits: object[] = [],
  ) =>
    invoke(deleteProfile, {
      url: 'http://catalogue.test/profile/delete',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: confirm === undefined ? '' : `confirm=${confirm}`,
      locals: {
        user: user as never,
        subscriptions: creditsOf(credits),
        ...(deleteUser !== undefined && { auth: fakeAuth({ deleteUser }) }),
      },
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

  it('refuses while a refund asked for is still to be made, or a payment is disputed, without asking Better Auth', async () => {
    const deleteUser = vi.fn(() => Promise.resolve(answer({ success: true })));
    const asked = new Date('2026-11-20T00:00:00Z');
    const refund = { disputed: null, refundRequestedAt: asked, refundedAt: null };
    expect((await post('yes', deleteUser, USER, [refund])).headers.get('Location')).toBe('/profile?problem=refund');
    const dispute = { disputed: 'open', refundRequestedAt: null, refundedAt: null };
    expect((await post('yes', deleteUser, USER, [refund, dispute])).headers.get('Location')).toBe(
      '/profile?problem=dispute',
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses while an admin views the site as the user, without asking Better Auth', async () => {
    const deleteUser = vi.fn(() => Promise.resolve(answer({ success: true })));
    const response = await invoke(deleteProfile, {
      url: 'http://catalogue.test/profile/delete',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'confirm=yes',
      locals: {
        user: USER,
        session: { ...SESSION, impersonatedBy: 'admin' } as never,
        auth: fakeAuth({ deleteUser }),
        subscriptions: creditsOf(),
      },
    });
    expect(response.headers.get('Location')).toBe('/profile?problem=impersonating');
    expect(deleteUser).not.toHaveBeenCalled();
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
  it('give every page the name the user is shown by, whether they are an admin, and whether one views as them', async () => {
    const signedIn = { name: USER.handle, admin: false, impersonated: false };
    await expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: USER, isAdmin: false } }))).resolves.toEqual({
      dateLocale: 'en',
      signedIn,
      returnTo: null,
    });
    await expect(
      layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: { ...USER, nickname: 'Ulenar' }, isAdmin: false } })),
    ).resolves.toMatchObject({ signedIn: { ...signedIn, name: 'Ulenar' } });
    await expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: USER, isAdmin: true } }))).resolves.toMatchObject({
      signedIn: { ...signedIn, admin: true },
    });
    const viewedAs = { ...SESSION, impersonatedBy: 'u-admin' } as never;
    const returns = { returnOf: vi.fn(() => Promise.resolve(undefined)), setReturn: vi.fn() };
    await expect(
      layoutLoad(
        fakeEvent<LayoutEvent>({
          locals: { user: USER, session: viewedAs, isAdmin: false, accounts: returns as never },
        }),
      ),
    ).resolves.toMatchObject({ signedIn: { ...signedIn, impersonated: true } });
    await expect(layoutLoad(fakeEvent<LayoutEvent>({ locals: { user: null } }))).resolves.toEqual({
      dateLocale: 'en',
      signedIn: null,
      returnTo: null,
    });
    // Dates as the reader's browser writes them, in the regional form of the page's language it prefers.
    await expect(
      layoutLoad(
        fakeEvent<LayoutEvent>({
          headers: { 'Accept-Language': 'fr-FR, en-GB;q=0.9, en;q=0.8' },
          locals: { user: null },
        }),
      ),
    ).resolves.toMatchObject({ dateLocale: 'en-GB' });
  });

  describe('the way back to another application', () => {
    const CATALOGUE = 'https://catalogue.example.org';
    const BACK = { url: `${CATALOGUE}/developers`, site: 'catalogue' } as const;
    const arriving = `http://accounts.test/profile?next=${encodeURIComponent(BACK.url)}&from=catalogue`;
    const load = (url: string, session: unknown, kept?: typeof BACK) => {
      const accounts = { returnOf: vi.fn(() => Promise.resolve(kept)), setReturn: vi.fn(() => Promise.resolve()) };
      const event = fakeEvent<LayoutEvent>({
        url,
        locals: {
          user: session === null ? null : USER,
          session: session as never,
          accounts: accounts as never,
          appOrigins: [CATALOGUE],
        },
      });
      return { accounts, data: layoutLoad(event) };
    };

    it('is offered by the page that says it, and kept with the session for the pages after', async () => {
      const { accounts, data } = load(arriving, SESSION);
      await expect(data).resolves.toMatchObject({ returnTo: BACK });
      expect(accounts.setReturn).toHaveBeenCalledWith(SESSION.id, BACK);
      expect(accounts.returnOf).not.toHaveBeenCalled();
    });

    it('is offered from what the session kept, on a page that says nothing of it', async () => {
      const { accounts, data } = load('http://accounts.test/subscription?checkout=done', SESSION, BACK);
      await expect(data).resolves.toMatchObject({ returnTo: BACK });
      expect(accounts.returnOf).toHaveBeenCalledWith(SESSION.id);
      expect(accounts.setReturn).not.toHaveBeenCalled();
    });

    it('is offered to a visitor not signed in, kept nowhere', async () => {
      const { accounts, data } = load(arriving, null);
      await expect(data).resolves.toMatchObject({ returnTo: BACK });
      expect(accounts.setReturn).not.toHaveBeenCalled();
    });

    it.each([
      ['a site the accounts do not know', `?next=${encodeURIComponent('https://elsewhere.example/')}&from=catalogue`],
      ["an application that is not one of Mondarth's", `?next=${encodeURIComponent(BACK.url)}&from=elsewhere`],
      ["a page of the accounts' own", '?next=%2Fprofile&from=catalogue'],
      ['no page', '?from=catalogue'],
    ])('is not taken from %s', async (_, query) => {
      const { accounts, data } = load(`http://accounts.test/profile${query}`, SESSION);
      await expect(data).resolves.toMatchObject({ returnTo: null });
      expect(accounts.setReturn).not.toHaveBeenCalled();
    });
  });

  it('give the sign-in page its providers, and say when a sign-in failed', async () => {
    const page = (user: unknown, url = 'http://catalogue.test/') =>
      homeLoad(fakeEvent<HomeEvent>({ url, locals: { user: user as never, providers: ['github'] } }));
    await expect(page(null)).resolves.toEqual({ providers: ['github'], failed: false, banned: null, next: undefined });
    await expect(page(null, 'http://catalogue.test/?error=sign-in')).resolves.toEqual({
      providers: ['github'],
      failed: true,
      banned: null,
      next: undefined,
    });
    await expect(page(USER)).resolves.toEqual({ providers: [], failed: false, banned: null, next: undefined });
  });

  it('sends a visitor back to the application they came from once signed in, at once if they are', async () => {
    const page = (user: unknown, next: string) =>
      homeLoad(
        fakeEvent<HomeEvent>({
          url: `http://accounts.test/?next=${encodeURIComponent(next)}`,
          locals: { user: user as never, providers: ['github'], appOrigins: ['https://catalogue.example.org'] },
        }),
      );
    await expect(page(null, 'https://catalogue.example.org/developers')).resolves.toMatchObject({
      next: 'https://catalogue.example.org/developers',
    });
    await expect(page(null, 'https://elsewhere.example/')).resolves.toMatchObject({ next: '/' });
    await expect(page(USER, 'https://catalogue.example.org/')).rejects.toMatchObject({
      status: 303,
      location: 'https://catalogue.example.org/',
    });
    await expect(page(USER, '/profile')).rejects.toMatchObject({ status: 303, location: '/profile' });
  });

  // Regression: a banned user was told only that signing in did not work.
  describe('for a sign-in refused as its user is banned', () => {
    const notices = banNotices('a-test-secret-a-test-secret-a-test-secret');
    const banned = (description: string, detail?: Partial<UserDetail>) =>
      homeLoad(
        fakeEvent<HomeEvent>({
          url: `http://catalogue.test/?error=sign-in&error=BANNED_USER&error_description=${encodeURIComponent(description)}`,
          locals: {
            user: null,
            providers: ['github'],
            banNotices: notices,
            accounts: {
              userDetail: (id: string) =>
                Promise.resolve(detail === undefined || id !== 'u1' ? undefined : (detail as UserDetail)),
            } as unknown as AccountsStore,
          },
        }),
      );

    it('says until when, and why, from the database, for a notice the site made', async () => {
      const until = new Date('2026-12-01T00:00:00Z');
      await expect(
        banned(notices.make('u1'), { banned: true, banReason: 'Spam', banExpires: until }),
      ).resolves.toMatchObject({ failed: true, banned: { known: true, reason: 'Spam', until } });
      await expect(
        banned(notices.make('u1'), { banned: true, banReason: null, banExpires: null }),
      ).resolves.toMatchObject({ banned: { known: true, reason: null, until: null } });
    });

    it('says only that the profile is banned for a notice it cannot read, or a user no longer banned', async () => {
      await expect(banned('You have been banned: call this number')).resolves.toMatchObject({
        banned: { known: false },
      });
      await expect(banned(notices.make('u1'), { banned: false })).resolves.toMatchObject({ banned: { known: false } });
      await expect(banned(notices.make('u2'), { banned: true })).resolves.toMatchObject({ banned: { known: false } });
    });

    it('reads no notice once signed in', async () => {
      const result = await homeLoad(
        fakeEvent<HomeEvent>({
          url: 'http://catalogue.test/?error=BANNED_USER',
          locals: { user: USER, providers: ['github'] },
        }),
      );
      expect(result).toMatchObject({ banned: null, failed: true });
    });

    it('takes a missing description as a notice it cannot read', async () => {
      const result = await homeLoad(
        fakeEvent<HomeEvent>({
          url: 'http://catalogue.test/?error=BANNED_USER',
          locals: { user: null, providers: [], banNotices: notices },
        }),
      );
      expect(result).toMatchObject({ banned: { known: false } });
    });
  });
});

describe('the profile page', () => {
  const accounts = (store: Partial<AccountsStore>) => store as AccountsStore;

  it('gives the profile and what is stored, and why it was come back to', async () => {
    const linkedProviders = vi.fn(() => Promise.resolve([{ providerId: 'github', linkedAt: new Date() }]));
    const loaded = (url: string, user: object = USER) =>
      profileLoad(
        fakeEvent<ProfileEvent>({
          url,
          locals: {
            user: user as never,
            session: SESSION as never,
            accounts: accounts({ linkedProviders, sessionsOf: () => Promise.resolve([]) }),
            subscriptions: creditsOf(),
          },
        }),
      );
    await expect(loaded('http://catalogue.test/profile?problem=stale&saved')).resolves.toEqual({
      deletionBlock: null,
      devices: [],
      signedOut: null,
      impersonated: false,
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

    it('records a change made while an admin views the site as the user, as the admin, done as the user', async () => {
      const setNickname = vi.fn<AccountsStore['setNickname']>(() => Promise.resolve('ok'));
      const record = vi.fn<AuditStore['record']>(() => Promise.resolve());
      const run = (session: unknown) =>
        thrown(() =>
          nickname(
            fakeEvent<NicknameEvent>({
              url: 'http://catalogue.test/profile?/nickname',
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'nickname=Ulenar',
              locals: {
                user: USER,
                session: session as never,
                accounts: accounts({ setNickname }),
                audit: { record } as unknown as AuditStore,
              },
            }),
          ),
        );
      await run(SESSION);
      expect(record).not.toHaveBeenCalled();
      await run({ ...SESSION, impersonatedBy: 'admin' });
      expect(record).toHaveBeenCalledWith({
        actorId: 'admin',
        asUserId: 'u1',
        action: 'profile.nickname',
        subjectId: 'u1',
        before: { nickname: null },
        after: { nickname: 'Ulenar' },
        requestId: 'request-1',
      });
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

describe('going back to another application', () => {
  const CATALOGUE = 'https://catalogue.example.org';
  const go = (to: string, session: unknown = SESSION) => {
    const accounts = { clearReturn: vi.fn(() => Promise.resolve()) };
    const response = invoke(goBack, {
      url: `http://accounts.test/return?to=${encodeURIComponent(to)}`,
      locals: { session: session as never, accounts: accounts as never, appOrigins: [CATALOGUE] },
    });
    return { accounts, response };
  };

  it('goes to the page, forgetting the way back the session kept', async () => {
    const { accounts, response } = go(`${CATALOGUE}/developers`);
    const answered = await response;
    expect(answered.status).toBe(303);
    expect(answered.headers.get('location')).toBe(`${CATALOGUE}/developers`);
    expect(accounts.clearReturn).toHaveBeenCalledWith(SESSION.id);
  });

  it('goes home from anywhere the accounts do not send visitors, and keeps nothing for no one', async () => {
    for (const to of ['https://elsewhere.example/', '/profile', '//elsewhere.example']) {
      expect((await go(to).response).headers.get('location')).toBe('/');
    }
    const { accounts, response } = go(`${CATALOGUE}/`, null);
    expect((await response).headers.get('location')).toBe(`${CATALOGUE}/`);
    expect(accounts.clearReturn).not.toHaveBeenCalled();
  });
});
