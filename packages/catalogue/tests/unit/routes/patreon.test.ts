import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { actions as offerActions, load as offersLoad } from '../../../src/routes/admin/subscriptions/+page.server.js';
import { load as userLoad } from '../../../src/routes/admin/users/[id]/+page.server.js';
import { actions, load } from '../../../src/routes/subscription/+page.server.js';
import { POST as linkPatreon } from '../../../src/routes/subscription/link-patreon/+server.js';
import { fakeEvent, invoke } from '../support/event.js';

import type { AccountsStore } from '../../../src/lib/server/accounts/store.js';
import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { Auth } from '../../../src/lib/server/accounts/auth.js';
import type { PatreonChecker, PatreonStatus } from '../../../src/lib/server/subscriptions/patreon.js';
import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

const USER = { id: 'ada', handle: 'handle-ada' };
const CHECKED = new Date('2026-11-20T00:00:00Z');
const MINIMUM = { currency: 'GBP', amount: 300 };
const SUBSCRIBED: PatreonStatus = {
  linked: true,
  subscribed: true,
  membership: {
    userId: 'ada',
    patronStatus: 'active_patron',
    amount: 500,
    nextChargeAt: null,
    checkedAt: CHECKED,
    askedAt: CHECKED,
    failure: null,
  },
};

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<NonNullable<(typeof actions)['unlink']>>[0];

/**
 * What a load or action threw, which SvelteKit's redirect and error are.
 *
 * @param run - What to run
 * @returns What it threw
 */
async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

/** Patreon, as the pages ask it: each of its calls a mock. */
type MockChecker = { [K in keyof PatreonChecker]: Mock<PatreonChecker[K]> };

/**
 * Patreon, as the pages ask it.
 *
 * @param more - What differs
 * @returns The checker
 */
function patreonWith(more: Partial<PatreonChecker> = {}): MockChecker {
  return {
    status: vi.fn<PatreonChecker['status']>(more.status ?? (() => Promise.resolve(SUBSCRIBED))),
    kept: vi.fn<PatreonChecker['kept']>(more.kept ?? (() => Promise.resolve(SUBSCRIBED))),
    minimum: vi.fn<PatreonChecker['minimum']>(more.minimum ?? (() => Promise.resolve(MINIMUM))),
    setMinimum: vi.fn<PatreonChecker['setMinimum']>(() => Promise.resolve()),
    accountOf: vi.fn<PatreonChecker['accountOf']>(more.accountOf ?? (() => Promise.resolve('acc-ada'))),
    forget: vi.fn<PatreonChecker['forget']>(() => Promise.resolve()),
  };
}

const subscriptions = {
  history: () => Promise.resolve([]),
  activeOffers: () => Promise.resolve([]),
  processingCheckouts: () => Promise.resolve([]),
} as unknown as SubscriptionStore;

describe('the subscription page, with Patreon', () => {
  const page = (url = 'http://catalogue.test/subscription', patreon: MockChecker | null = patreonWith()) =>
    load(
      fakeEvent<LoadEvent>({
        url,
        locals: {
          user: USER as never,
          isAdmin: false,
          patreon: patreon ?? undefined,
          subscriptions,
          entitlement: () => Promise.resolve({ paidUntil: null, active: false, patreon: true, entitled: true }),
        },
      }),
    ) as Promise<Record<string, unknown>>;

  it("gives the user's Patreon, what it last said, and the least pledge", async () => {
    expect(await page()).toMatchObject({
      patreon: {
        linked: true,
        subscribed: true,
        minimum: MINIMUM,
        membership: {
          patronStatus: 'active_patron',
          amount: 500,
          nextChargeAt: null,
          checkedAt: CHECKED,
          failure: null,
        },
      },
      patreonDone: null,
      patreonError: null,
    });
  });

  it('gives no Patreon where the catalogue does not offer it, and no least pledge unset', async () => {
    expect(await page('http://catalogue.test/subscription', null)).toMatchObject({ patreon: null });
    const unlinked = patreonWith({
      status: () => Promise.resolve({ linked: false, subscribed: false, membership: null }),
      minimum: () => Promise.resolve(null),
    });
    expect(await page('http://catalogue.test/subscription', unlinked)).toMatchObject({
      patreon: { linked: false, membership: null, minimum: null },
    });
  });

  it('says what was done, and why a link failed', async () => {
    expect(await page('http://catalogue.test/subscription?patreon=linked')).toMatchObject({ patreonDone: 'linked' });
    expect(
      await page('http://catalogue.test/subscription?error=account_already_linked_to_different_user'),
    ).toMatchObject({ patreonError: 'taken' });
    expect(await page('http://catalogue.test/subscription?error=state_mismatch')).toMatchObject({
      patreonError: 'failed',
    });
    expect(await page('http://catalogue.test/subscription?error=refused')).toMatchObject({ patreonError: 'refused' });
  });
});

describe("the subscription page's Patreon actions", () => {
  function act(
    action: 'unlink' | 'check',
    api: Record<string, unknown>,
    patreon: MockChecker | null = patreonWith(),
    user: unknown = USER,
  ) {
    return actions[action]?.(
      fakeEvent<ActionEvent>({
        url: `http://catalogue.test/subscription?/${action}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
        locals: { user: user as never, patreon: patreon ?? undefined, auth: { api } as unknown as Auth },
      }),
    );
  }

  it('unlinks Patreon by its account', async () => {
    const unlinkAccount = vi.fn(() => Promise.resolve(Response.json({ status: true })));
    const error = await thrown(() => act('unlink', { unlinkAccount }));
    expect(isRedirect(error) && error.location).toBe('/subscription?patreon=unlinked');
    expect(unlinkAccount).toHaveBeenCalledWith(expect.objectContaining({ body: { accountId: 'acc-ada' } }));
  });

  it('says Patreon cannot be unlinked when it is how the user signs in alone', async () => {
    const only = await act('unlink', { unlinkAccount: () => Promise.resolve(new Response('', { status: 400 })) });
    expect(isActionFailure(only) && only.data).toEqual({ patreon: 'only' });
    const other = await act('unlink', { unlinkAccount: () => Promise.resolve(new Response('', { status: 403 })) });
    expect(isActionFailure(other) && other.data).toEqual({ patreon: 'refused' });
  });

  it('comes back to the page when there is nothing to unlink', async () => {
    const error = await thrown(() => act('unlink', {}, patreonWith({ accountOf: () => Promise.resolve(undefined) })));
    expect(isRedirect(error) && error.location).toBe('/subscription');
  });

  it('asks Patreon again at once', async () => {
    const patreon = patreonWith();
    const error = await thrown(() => act('check', {}, patreon));
    expect(isRedirect(error) && error.location).toBe('/subscription?patreon=checked');
    expect(patreon.status).toHaveBeenCalledWith('ada', { force: true });
  });

  it.each(['unlink', 'check'] as const)('%s is not found where the catalogue does not offer Patreon', async action => {
    const error = await thrown(() => act(action, {}, null));
    expect(isHttpError(error, 404)).toBe(true);
  });

  it.each(['unlink', 'check'] as const)('%s goes home for anyone not signed in', async action => {
    const error = await thrown(() => act(action, {}, patreonWith(), null));
    expect(isRedirect(error) && error.location).toBe('/');
  });
});

describe('linking Patreon', () => {
  const link = (api: Record<string, unknown>, patreon: MockChecker | null = patreonWith(), user: unknown = USER) =>
    invoke(linkPatreon, {
      method: 'POST',
      locals: { user: user as never, patreon: patreon ?? undefined, auth: { api } as unknown as Auth },
    });

  it("sends the browser to Patreon, with Better Auth's cookies, to come back to the subscription page", async () => {
    const linkSocialAccount = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { url: 'https://www.patreon.com/oauth2/authorize?x', redirect: true },
          { headers: { 'Set-Cookie': 'state=s1; Path=/' } },
        ),
      ),
    );
    const response = await link({ linkSocialAccount });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://www.patreon.com/oauth2/authorize?x');
    expect(response.headers.getSetCookie()).toEqual(['state=s1; Path=/']);
    expect(linkSocialAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { provider: 'patreon', callbackURL: '/subscription?patreon=linked', errorCallbackURL: '/subscription' },
      }),
    );
  });

  it('comes back saying a link refused was, as for an admin viewing the site as someone, or failed', async () => {
    const refused = await thrown(() =>
      link({ linkSocialAccount: () => Promise.resolve(new Response('', { status: 403 })) }),
    );
    expect(isRedirect(refused) && refused.location).toBe('/subscription?error=refused');
    const failed = await thrown(() =>
      link({ linkSocialAccount: () => Promise.resolve(Response.json({}, { status: 500 })) }),
    );
    expect(isRedirect(failed) && failed.location).toBe('/subscription?error=failed');
  });

  it('is not found where the catalogue does not offer Patreon, and goes home for anyone not signed in', async () => {
    expect(isHttpError(await thrown(() => link({}, null)), 404)).toBe(true);
    const home = await thrown(() => link({}, patreonWith(), null));
    expect(isRedirect(home) && home.location).toBe('/');
  });
});

describe("the offers page's least Patreon pledge", () => {
  type OffersEvent = Parameters<typeof offersLoad>[0];
  type OfferEvent = Parameters<NonNullable<(typeof offerActions)['patreonMinimum']>>[0];
  const record = vi.fn<AuditStore['record']>(() => Promise.resolve());

  it('gives the least pledge where the catalogue offers Patreon', async () => {
    const result = await offersLoad(
      fakeEvent<OffersEvent>({
        url: 'http://catalogue.test/admin/subscriptions',
        locals: {
          subscriptions: {
            offers: () => Promise.resolve([]),
            refundRequests: () => Promise.resolve([]),
            openDisputes: () => Promise.resolve([]),
          } as unknown as SubscriptionStore,
          patreon: patreonWith(),
        },
      }),
    );
    expect(result).toMatchObject({ patreonMinimum: MINIMUM });
  });

  const set = (minimum: string, patreon: MockChecker | null = patreonWith()) =>
    offerActions.patreonMinimum?.(
      fakeEvent<OfferEvent>({
        url: 'http://catalogue.test/admin/subscriptions?/patreonMinimum',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ minimum }).toString(),
        locals: {
          user: { id: 'admin' } as never,
          session: { id: 's1' } as never,
          patreon: patreon ?? undefined,
          audit: { record } as unknown as AuditStore,
          requestId: 'r1',
        },
      }),
    );

  it('sets the least pledge from a price, recording before and after', async () => {
    const patreon = patreonWith();
    const error = await thrown(() => set('gbp 5.00', patreon));
    expect(isRedirect(error) && error.location).toBe('/admin/subscriptions?done=patreon');
    expect(patreon.setMinimum).toHaveBeenCalledWith({ currency: 'GBP', amount: 500 }, 'admin');
    expect(record).toHaveBeenLastCalledWith({
      actorId: 'admin',
      action: 'patreon.minimum',
      before: { minimum: MINIMUM },
      after: { minimum: { currency: 'GBP', amount: 500 } },
      requestId: 'r1',
    });
  });

  it('clears it when left empty', async () => {
    const patreon = patreonWith();
    await thrown(() => set('', patreon));
    expect(patreon.setMinimum).toHaveBeenCalledWith(null, 'admin');
  });

  it.each(['five pounds', 'GBP 5.00\nUSD 6.00', 'XXX 5'])('refuses %j, keeping what was given', async given => {
    const patreon = patreonWith();
    const refused = await set(given, patreon);
    expect(isActionFailure(refused) && refused.data).toEqual({ minimum: given, problem: 'minimum' });
    expect(patreon.setMinimum).not.toHaveBeenCalled();
  });

  it('is not found where the catalogue does not offer Patreon', async () => {
    const error = await thrown(() => set('GBP 5.00', null));
    expect(isHttpError(error, 404)).toBe(true);
  });
});

describe("a user's admin page, with Patreon", () => {
  type UserLoadEvent = Parameters<typeof userLoad>[0];

  const userPage = (patreon: MockChecker | undefined, credits: unknown[] = []) =>
    userLoad(
      fakeEvent<UserLoadEvent>({
        url: 'http://catalogue.test/admin/users/ada',
        params: { id: 'ada' },
        locals: {
          user: { id: 'admin' } as never,
          adminUserIds: [],
          patreon,
          accounts: {
            userDetail: () => Promise.resolve({ ...USER, role: 'user', providers: [{ providerId: 'patreon' }] }),
          } as unknown as AccountsStore,
          subscriptions: {
            status: () => Promise.resolve({ paidUntil: null, active: false }),
            history: () => Promise.resolve(credits),
          } as unknown as SubscriptionStore,
          audit: { recent: () => Promise.resolve([]) } as unknown as AuditStore,
        },
      }),
    ) as Promise<Record<string, unknown>>;

  it("links each Stripe payment to Stripe's dashboard, in the mode it was made in, and nothing else", async () => {
    const credits = [
      { id: 'c1', provider: 'stripe', externalRef: 'pi_1', providerAccount: 'test' },
      { id: 'c2', provider: 'stripe', externalRef: null, providerAccount: null },
      { id: 'c3', provider: 'btcpay', externalRef: 'inv-1', providerAccount: null },
    ];
    expect(await userPage(undefined, credits)).toMatchObject({
      credits: [
        { id: 'c1', dashboard: 'https://dashboard.stripe.com/test/payments/pi_1' },
        { id: 'c2', dashboard: null },
        { id: 'c3', dashboard: null },
      ],
    });
  });

  it('shows what was kept of their Patreon, without asking Patreon', async () => {
    const patreon = patreonWith();
    expect(await userPage(patreon)).toMatchObject({ patreon: SUBSCRIBED });
    expect(patreon.kept).toHaveBeenCalledWith('ada');
    expect(patreon.status).not.toHaveBeenCalled();
  });

  it('shows no Patreon where the catalogue does not offer it', async () => {
    expect(await userPage(undefined)).toMatchObject({ patreon: null });
  });
});
