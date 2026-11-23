import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/device/+page.server.js';
import { POST as signIn } from '../../../src/routes/sign-in/[provider]/+server.js';
import { fakeEvent, invoke } from '../support/event.js';

import type { Auth } from '../../../src/lib/server/accounts/auth.js';

const USER = { id: 'ada', handle: 'handle-ada' };
const SESSION = { id: 's1', userId: 'ada' };

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<NonNullable<(typeof actions)['approve']>>[0];

/** Better Auth, as the page calls it. */
const fakeAuth = (api: Record<string, (...args: never[]) => Promise<Response>>) => ({ api }) as unknown as Auth;

/** What a load or action threw, which SvelteKit's redirect is. */
async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

describe('the /device page', () => {
  const page = (url: string, more: Record<string, unknown> = {}, verify?: () => Promise<Response>) =>
    load(
      fakeEvent<LoadEvent>({
        url: `http://catalogue.test${url}`,
        locals: {
          user: USER as never,
          session: SESSION as never,
          providers: ['github'],
          ...(verify !== undefined && { auth: fakeAuth({ deviceVerify: verify }) }),
          ...more,
        },
      }),
    );

  it('asks to sign in first, coming back to the code', async () => {
    expect(await page('/device?user_code=WDJB-MJHT', { user: null })).toEqual({
      state: 'sign-in',
      providers: ['github'],
      next: '/device?user_code=WDJB-MJHT',
    });
  });

  it('refuses an admin viewing the site as someone', async () => {
    expect(await page('/device', { session: { ...SESSION, impersonatedBy: 'admin' } })).toEqual({
      state: 'impersonating',
    });
  });

  it('asks for the code when the link had none, and says what was done', async () => {
    expect(await page('/device')).toEqual({ state: 'enter' });
    expect(await page('/device?user_code=%20%20')).toEqual({ state: 'enter' });
    expect(await page('/device?done=approved')).toEqual({ state: 'approved' });
    expect(await page('/device?done=denied')).toEqual({ state: 'denied' });
  });

  it('looks at the code, as the user, and asks them to approve its client', async () => {
    const verify = vi.fn(() => Promise.resolve(Response.json({ status: 'pending', client_id: 'emma-extension' })));
    expect(await page('/device?user_code=WDJB MJHT', {}, verify)).toEqual({
      state: 'confirm',
      code: 'WDJBMJHT',
      client: 'emma-extension',
    });
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ query: { user_code: 'WDJBMJHT' } }));
  });

  it.each([
    [Response.json({ error: 'expired_token' }, { status: 400 }), 'expired'],
    [Response.json({ error: 'invalid_request' }, { status: 400 }), 'unknown'],
    [new Response('no', { status: 500 }), 'unknown'],
    [Response.json({ status: 'approved' }), 'already'],
    [Response.json({ status: 'pending' }), 'unknown'],
  ])('says what is wrong with a code', async (answer, state) => {
    expect(await page('/device?user_code=X', {}, () => Promise.resolve(answer))).toEqual({ state });
  });
});

describe("the /device page's decisions", () => {
  const decide = (
    action: 'approve' | 'deny',
    api: Record<string, (...args: never[]) => Promise<Response>>,
    user = USER,
  ) =>
    actions[action]?.(
      fakeEvent<ActionEvent>({
        url: `http://catalogue.test/device?/${action}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'code=WDJB+MJHT',
        locals: { user: user as never, auth: fakeAuth(api) },
      }),
    );

  it.each([
    ['approve', 'deviceApprove', 'approved'],
    ['deny', 'deviceDeny', 'denied'],
  ] as const)('%s the device, and come back to say so', async (action, method, done) => {
    const call = vi.fn(() => Promise.resolve(Response.json({ success: true })));
    const error = await thrown(() => decide(action, { [method]: call }));
    expect(isRedirect(error) && error.location).toBe(`/device?done=${done}`);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ body: { userCode: 'WDJBMJHT' } }));
  });

  it('says a code that expired meanwhile has, and any other refusal as unknown', async () => {
    const expired = await decide('approve', {
      deviceApprove: () => Promise.resolve(Response.json({ error: 'expired_token' }, { status: 400 })),
    });
    expect(isActionFailure(expired) && expired.data).toEqual({ state: 'expired' });
    const other = await decide('deny', { deviceDeny: () => Promise.resolve(new Response('no', { status: 403 })) });
    expect(isActionFailure(other) && other.data).toEqual({ state: 'unknown' });
  });

  it('goes back to the page for anyone not signed in', async () => {
    const error = await thrown(() => decide('approve', {}, null as never));
    expect(isRedirect(error) && error.location).toBe('/device');
  });
});

describe('signing in, to come back', () => {
  it('comes back to the page of this site the form named, and home for anything else', async () => {
    const signInSocial = vi.fn<(input: { body: { callbackURL: string } }) => Promise<Response>>(() =>
      Promise.resolve(Response.json({ url: 'https://github.test/authorize' })),
    );
    const post = (body: string) =>
      invoke(signIn, {
        method: 'POST',
        params: { provider: 'github' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        locals: { providers: ['github'], auth: fakeAuth({ signInSocial }) },
      });
    await post('next=%2Fdevice%3Fuser_code%3DWDJBMJHT');
    expect(signInSocial.mock.lastCall?.[0].body.callbackURL).toBe('/device?user_code=WDJBMJHT');
    await post('next=https%3A%2F%2Felsewhere.example');
    expect(signInSocial.mock.lastCall?.[0].body.callbackURL).toBe('/');
  });
});
