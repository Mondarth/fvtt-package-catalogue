import { describe, expect, it, vi } from 'vitest';

import { banNotices } from '../../../../src/lib/server/accounts/ban-notice.js';
import { createAccountsHandle, isAuthPath } from '../../../../src/lib/server/accounts/handle.js';
import { fakeEvent } from '../../support/event.js';

import type { RequestEvent } from '@sveltejs/kit';
import type { AccessRecorder } from '../../../../src/lib/server/accounts/access.js';
import type { AuditStore } from '../../../../src/lib/server/accounts/audit.js';
import type { Auth } from '../../../../src/lib/server/accounts/auth.js';
import type { AccountsStore } from '../../../../src/lib/server/accounts/store.js';
import type { StripeGateway } from '../../../../src/lib/server/subscriptions/stripe.js';
import type { SubscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';

const USER = { id: 'u1', handle: 'amber-fox-oak-01' };
const SESSION = { id: 's1', userId: 'u1' };
const STRIPE = { currency: 'GBP' } as StripeGateway;
const ACCESS = { record: vi.fn(() => Promise.resolve()), seen: vi.fn(() => Promise.resolve()) };

function setUp(found: { user: typeof USER; session: Record<string, unknown> } | null) {
  const cookies = new Headers();
  cookies.append('Set-Cookie', 'session=renewed');
  const auth = {
    handler: vi.fn(() => Promise.resolve(new Response('from Better Auth'))),
    api: { getSession: vi.fn(() => Promise.resolve({ headers: cookies, response: found })) },
  };
  const accounts = {} as AccountsStore;
  const audit = {} as AuditStore;
  const handle = createAccountsHandle(auth as unknown as Auth, {
    accounts,
    providers: ['github'],
    audit,
    adminUserIds: ['u-admin'],
    banNotices: banNotices('a-test-secret-a-test-secret-a-test-secret'),
    subscriptions: {} as SubscriptionStore,
    stripe: STRIPE,
    access: ACCESS as unknown as AccessRecorder,
  });
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

  it('passes the internal API and the health check through, not signed in to', async () => {
    const { auth, resolve, run } = setUp(null);
    for (const path of ['/internal/v1/token-user', '/healthz']) {
      const { event, response } = run(path);
      await response;
      expect(event.locals.user).toBeNull();
    }
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('gives a webhook the subscriptions, the audit log and Stripe, but no one signed in', async () => {
    const { auth, resolve, run } = setUp(null);
    const { event, response } = run('/webhooks/stripe');
    await response;
    expect(event.locals).toMatchObject({ user: null, stripe: STRIPE, subscriptions: {}, audit: {}, access: ACCESS });
    expect(resolve).toHaveBeenCalledOnce();
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('gives each page who is signed in, and sets the cookie again where reading the session renewed it', async () => {
    const { accounts, run } = setUp({ user: USER, session: SESSION });
    const { event, response } = run('/profile');
    const answered = await response;
    expect(event.locals).toMatchObject({ user: USER, session: SESSION, accounts, providers: ['github'] });
    expect(answered.headers.getSetCookie()).toEqual(['session=renewed']);
  });

  it("records a signed-in user's use of the site for the access recorder, but not an admin's viewing it as them", async () => {
    ACCESS.record.mockClear();
    const { run } = setUp({ user: USER, session: SESSION });
    const { event, response } = run('/subscription');
    await response;
    expect(ACCESS.record).toHaveBeenCalledWith('u1', {
      kind: 'site',
      path: '/subscription',
      client: 'website',
      ipAddress: null,
      userAgent: null,
    });
    expect(event.locals.access).toBe(ACCESS);
    // Its last session kept from where the catalogue sees it.
    expect(ACCESS.seen).toHaveBeenCalledWith(
      'u1',
      's1',
      expect.objectContaining({ kind: 'site', path: '/subscription' }),
    );

    ACCESS.record.mockClear();
    const viewing = setUp({ user: USER, session: { ...SESSION, impersonatedBy: 'admin' } });
    await viewing.run('/subscription').response;
    await setUp(null).run('/').response;
    expect(ACCESS.record).not.toHaveBeenCalled();
  });

  it('gives each page no one, when no one is signed in', async () => {
    const { run } = setUp(null);
    const { event, response } = run('/');
    await response;
    expect(event.locals.user).toBeNull();
    expect(event.locals.session).toBeNull();
  });
});
