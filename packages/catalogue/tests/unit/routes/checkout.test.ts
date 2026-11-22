import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/subscription/+page.server.js';
import { fakeEvent } from '../support/event.js';

import type { StripeGateway } from '../../../src/lib/server/subscriptions/stripe.js';
import type { Checkout, Offer, SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

const USER = { id: 'u1', handle: 'amber-fox-oak-01', email: 'amber@example.test' };
const NOW = new Date('2026-12-01T00:00:00Z');

const offer = (more: Partial<Offer> = {}): Offer => ({
  id: 'o1',
  name: '12 months',
  months: 12,
  days: 0,
  prices: { GBP: 3000, EUR: 3500 },
  providers: ['stripe'],
  providerRefs: { stripe: { product: 'prod_1', price: 'price_1' } },
  availableFrom: null,
  availableUntil: null,
  retiredAt: null,
  createdBy: 'admin',
  createdAt: NOW,
  ...more,
});

const checkout = (more: Partial<Checkout> = {}): Checkout => ({
  id: 'k1',
  userId: 'u1',
  offerId: 'o1',
  provider: 'stripe',
  sessionId: null,
  status: 'open',
  consentedAt: NOW,
  creditId: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...more,
});

/** A Stripe whose checkout starts at Stripe's page, or fails as told. */
function fakeStripe(fails = false) {
  return {
    currency: 'GBP',
    offerPrice: vi.fn<StripeGateway['offerPrice']>(),
    retireOfferPrice: vi.fn<StripeGateway['retireOfferPrice']>(),
    checkout: vi.fn<StripeGateway['checkout']>(() =>
      fails
        ? Promise.reject(new Error('Stripe is down'))
        : Promise.resolve({ id: 'cs_1', url: 'https://checkout.stripe.test/c/pay/cs_1' }),
    ),
    refund: vi.fn<StripeGateway['refund']>(),
    event: vi.fn<StripeGateway['event']>(),
  };
}

/** The subscriptions' store, as buying uses it. */
function fakeStore(offers: Offer[] = [offer()]) {
  return {
    activeOffers: vi.fn(() => Promise.resolve(offers)),
    openCheckout: vi.fn<SubscriptionStore['openCheckout']>(() => Promise.resolve(checkout())),
    attachSession: vi.fn<SubscriptionStore['attachSession']>(() => Promise.resolve()),
    settleCheckout: vi.fn<SubscriptionStore['settleCheckout']>(() => Promise.resolve()),
  };
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

type BuyEvent = Parameters<NonNullable<(typeof actions)['buy']>>[0];
type LoadEvent = Parameters<typeof load>[0];
/** What the page is given, as these tests read it. */
interface Loaded {
  readonly canBuy: boolean;
  readonly processing: number;
  readonly checkout: string | null;
  readonly offers: readonly { readonly id: string; readonly stripePrice: unknown }[];
}

/**
 * Buys, with the form given.
 * @param form - The form's fields
 * @param locals - What the request has besides
 * @returns What the action gave
 */
function buy(form: Record<string, string>, locals: Partial<App.Locals>) {
  const run = actions.buy;
  if (run === undefined) throw new Error('No buy action');
  return run(
    fakeEvent<BuyEvent>({
      url: 'https://catalogue.test/subscription?/buy',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      locals: { user: USER as never, session: {} as never, ...locals },
    }),
  );
}

describe('buying an offer through Stripe', () => {
  it('records the consent, begins a checkout, and sends the buyer to Stripe to pay', async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const error = await thrown(() =>
      buy({ offer: 'o1', consent: 'on' }, { stripe, subscriptions: store as unknown as SubscriptionStore }),
    );
    expect(isRedirect(error) && error.location).toBe('https://checkout.stripe.test/c/pay/cs_1');
    expect(store.openCheckout).toHaveBeenCalledWith({
      userId: 'u1',
      offerId: 'o1',
      provider: 'stripe',
      consentedAt: expect.any(Date) as Date,
    });
    expect(stripe.checkout).toHaveBeenCalledWith({
      price: 'price_1',
      checkoutId: 'k1',
      userId: 'u1',
      offerId: 'o1',
      email: 'amber@example.test',
      successUrl: 'https://catalogue.test/subscription?checkout=done',
      cancelUrl: 'https://catalogue.test/subscription?checkout=cancelled',
    });
    expect(store.attachSession).toHaveBeenCalledWith('k1', 'cs_1');
  });

  it('refuses without the consent, keeping which offer it was', async () => {
    const store = fakeStore();
    const result = await buy(
      { offer: 'o1' },
      { stripe: fakeStripe(), subscriptions: store as unknown as SubscriptionStore },
    );
    expect(isActionFailure(result) && result.data).toEqual({ buy: 'consent', offer: 'o1' });
    expect(store.openCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ['not on sale', []],
    ['not sold through Stripe', [offer({ providers: [], providerRefs: {} })]],
  ])('refuses an offer %s', async (_why, offers) => {
    const store = fakeStore(offers);
    const result = await buy(
      { offer: 'o1', consent: 'on' },
      { stripe: fakeStripe(), subscriptions: store as unknown as SubscriptionStore },
    );
    expect(isActionFailure(result) && result.data).toEqual({ buy: 'offer' });
    expect(store.openCheckout).not.toHaveBeenCalled();
  });

  it('closes the checkout begun when Stripe cannot start it, and says so', async () => {
    const store = fakeStore();
    const result = await buy(
      { offer: 'o1', consent: 'on' },
      { stripe: fakeStripe(true), subscriptions: store as unknown as SubscriptionStore },
    );
    expect(isActionFailure(result) && result.status).toBe(502);
    expect(isActionFailure(result) && result.data).toEqual({ buy: 'stripe' });
    expect(store.settleCheckout).toHaveBeenCalledWith('k1', 'failed');
    expect(store.attachSession).not.toHaveBeenCalled();
  });

  it('sells nothing while an admin views the site as the user', async () => {
    const store = fakeStore();
    const result = await buy(
      { offer: 'o1', consent: 'on' },
      {
        stripe: fakeStripe(),
        subscriptions: store as unknown as SubscriptionStore,
        session: { impersonatedBy: 'admin' } as never,
      },
    );
    expect(isActionFailure(result) && result.data).toEqual({ buy: 'impersonating' });
    expect(store.openCheckout).not.toHaveBeenCalled();
  });

  it('is the sign-in page for anyone not signed in, and nothing where Stripe is not set up', async () => {
    const signedOut = await thrown(() => buy({ offer: 'o1', consent: 'on' }, { user: null }));
    expect(isRedirect(signedOut) && signedOut.location).toBe('/');
    const noStripe = await thrown(() => buy({ offer: 'o1', consent: 'on' }, { stripe: undefined }));
    expect(isHttpError(noStripe) && noStripe.status).toBe(404);
  });
});

describe('the subscription page, where the catalogue sells through Stripe', () => {
  /**
   * Loads the page.
   * @param locals - What the request has besides the user
   * @param url - Its address
   * @returns What the page is given
   */
  async function loaded(
    locals: Partial<App.Locals>,
    url = 'https://catalogue.test/subscription?checkout=done',
  ): Promise<Loaded> {
    const result = (await load(
      fakeEvent<LoadEvent>({
        url,
        locals: {
          user: USER as never,
          session: {} as never,
          isAdmin: false,
          entitlement: () => Promise.resolve({ paidUntil: null, active: false, patreon: false, entitled: false }),
          subscriptions: {
            history: () => Promise.resolve([]),
            activeOffers: () =>
              Promise.resolve([
                offer(),
                offer({ id: 'o2', prices: { EUR: 35 } }),
                offer({ id: 'o3', providerRefs: {} }),
              ]),
            processingCheckouts: () => Promise.resolve([checkout({ status: 'processing' })]),
          } as unknown as SubscriptionStore,
          ...locals,
        },
      }),
    )) as unknown as Loaded | undefined;
    if (result === undefined) throw new Error('The page gave nothing');
    return result;
  }

  it('prices each offer sold through Stripe before tax, in its currency, and says how the checkout came back', async () => {
    const result = await loaded({ stripe: fakeStripe() });
    expect(result).toMatchObject({ canBuy: true, processing: 1, checkout: 'done' });
    expect(result.offers.map(given => [given.id, given.stripePrice])).toEqual([
      ['o1', { currency: 'GBP', amount: 3000 }],
      ['o2', null],
      ['o3', null],
    ]);
  });

  it('offers nothing to buy while an admin views the site as the user, or without Stripe', async () => {
    const impersonated = await loaded({ stripe: fakeStripe(), session: { impersonatedBy: 'admin' } as never });
    expect(impersonated).toMatchObject({ canBuy: false });
    const without = await loaded({ stripe: undefined }, 'https://catalogue.test/subscription');
    expect(without).toMatchObject({ canBuy: false, checkout: null });
    expect(without.offers.every(given => given.stripePrice === null)).toBe(true);
  });
});

describe('asking for a refund, on the subscription page', () => {
  type RefundEvent = Parameters<NonNullable<(typeof actions)['refund']>>[0];
  const record = vi.fn(() => Promise.resolve());

  /**
   * Asks for a refund of a credit.
   * @param requestRefund - What the store does
   * @param locals - What the request has besides
   * @returns What the action gave
   */
  function ask(
    requestRefund: SubscriptionStore['requestRefund'],
    locals: Partial<App.Locals> = {},
    form: Record<string, string> = {},
  ) {
    const run = actions.refund;
    if (run === undefined) throw new Error('No refund action');
    return run(
      fakeEvent<RefundEvent>({
        url: 'https://catalogue.test/subscription?/refund',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ credit: 'c1', confirmed: 'yes', ...form }).toString(),
        locals: {
          user: USER as never,
          session: {} as never,
          subscriptions: { requestRefund } as unknown as SubscriptionStore,
          audit: { record } as never,
          ...locals,
        },
      }),
    );
  }

  it('records it, audited, and confirms it on the page at once', async () => {
    const requestRefund = vi.fn(() => Promise.resolve({ id: 'c1', externalRef: 'pi_1' } as never));
    const error = await thrown(() => ask(requestRefund));
    expect(isRedirect(error) && error.location).toBe('/subscription?refund=requested');
    expect(requestRefund).toHaveBeenCalledWith('u1', 'c1', undefined);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        action: 'refund.request',
        after: { credit: 'c1', paymentIntent: 'pi_1', refundedAtOnce: null, reason: null },
      }),
    );
  });

  it("keeps the reason chosen, with the buyer's own words for Other", async () => {
    const requestRefund = vi.fn(() => Promise.resolve({ id: 'c1', externalRef: 'pi_1' } as never));
    await thrown(() => ask(requestRefund, {}, { reason: 'not-needed', reason_text: 'dropped' }));
    expect(requestRefund).toHaveBeenLastCalledWith('u1', 'c1', { reason: 'not-needed' });
    await thrown(() => ask(requestRefund, {}, { reason: 'other', reason_text: 'Moving on' }));
    expect(requestRefund).toHaveBeenLastCalledWith('u1', 'c1', { reason: 'other', text: 'Moving on' });
  });

  it.each([
    ['an unknown reason', { reason: 'bored' }],
    ['Other without words', { reason: 'other', reason_text: '' }],
    ['Other in too many words', { reason: 'other', reason_text: 'x'.repeat(501) }],
  ])('refuses %s, asking nothing', async (_why, form) => {
    const requestRefund = vi.fn();
    const result = await ask(requestRefund, {}, form);
    expect(isActionFailure(result) && result.data).toEqual({ refund: 'reason', credit: 'c1' });
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it('asks nothing until the buyer has confirmed it in its dialog', async () => {
    const requestRefund = vi.fn();
    const result = await ask(requestRefund, {}, { confirmed: 'no' });
    expect(isActionFailure(result) && result.data).toEqual({ refund: 'unconfirmed' });
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it('refuses a credit that cannot be refunded, and anything while an admin views the site as the user', async () => {
    const none = await ask(() => Promise.resolve(undefined));
    expect(isActionFailure(none) && none.data).toEqual({ refund: 'credit' });
    const impersonated = await ask(vi.fn(), { session: { impersonatedBy: 'admin' } as never });
    expect(isActionFailure(impersonated) && impersonated.data).toEqual({ refund: 'impersonating' });
    const signedOut = await thrown(() => ask(vi.fn(), { user: null }));
    expect(isRedirect(signedOut) && signedOut.location).toBe('/');
  });
});

describe('how each purchase stands with refunds, on the subscription page', () => {
  it('says each paid one is refundable, partly or wholly refunded, charged back, or asked to be', async () => {
    const at = (iso: string) => new Date(iso);
    const base = {
      userId: 'u1',
      provider: 'stripe',
      method: null,
      externalRef: 'pi',
      providerAccount: 'test',
      offerId: 'o1',
      amountPaid: 3000,
      currencyPaid: 'GBP',
      refundedAmount: 0,
      refundedAt: null,
      refundRequestedAt: null,
      disputed: null,
      months: 1,
      days: 0,
      startsAt: NOW,
      endsAt: NOW,
      grantedBy: null,
      note: null,
      createdAt: NOW,
      source: 'payment',
    };
    const credits = [
      { ...base, id: 'refundable' },
      { ...base, id: 'partly', refundedAmount: 1000, refundedAt: at('2026-12-02T00:00:00Z') },
      { ...base, id: 'refunded', refundedAmount: 3000 },
      // Partly refunded, for all its time not yet used: nothing more is owed.
      {
        ...base,
        id: 'nothing owed',
        refundedAmount: 1000,
        refundedAt: at('2026-12-02T00:00:00Z'),
        startsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
      { ...base, id: 'lost', disputed: 'lost' },
      { ...base, id: 'requested', refundRequestedAt: at('2026-12-02T00:00:00Z') },
      {
        ...base,
        id: 'asked again',
        refundedAmount: 1000,
        refundedAt: at('2026-12-02T00:00:00Z'),
        refundRequestedAt: at('2026-12-03T00:00:00Z'),
      },
      { ...base, id: 'free', amountPaid: null },
      { ...base, id: 'granted', source: 'grant' },
    ];
    const result = (await load(
      fakeEvent<LoadEvent>({
        url: 'https://catalogue.test/subscription?refund=requested',
        locals: {
          user: USER as never,
          session: {} as never,
          isAdmin: false,
          entitlement: () => Promise.resolve({ paidUntil: null, active: false, patreon: false, entitled: false }),
          subscriptions: {
            history: () => Promise.resolve(credits),
            activeOffers: () => Promise.resolve([]),
            processingCheckouts: () => Promise.resolve([]),
          } as unknown as SubscriptionStore,
        },
      }),
    )) as unknown as { history: { id: string; refund: unknown }[]; refundDone: unknown };
    expect(result.refundDone).toBe('requested');
    expect(Object.fromEntries(result.history.map(credit => [credit.id, credit.refund]))).toEqual({
      refundable: 'refundable',
      partly: 'partly',
      refunded: 'refunded',
      'nothing owed': 'refunded',
      lost: 'refunded',
      requested: 'requested',
      'asked again': 'requested',
      free: null,
      granted: null,
    });
  });
});

describe('cancelling within 14 days of buying', () => {
  type RefundEvent = Parameters<NonNullable<(typeof actions)['refund']>>[0];
  const DAY = 24 * 60 * 60 * 1000;
  const asked = new Date();

  /**
   * A purchase's credit, its refund just asked for: £36.00 for 30 days, bought `ago` days ago and an hour more, so that
   * the whole days left of it cannot change as the test runs, starting then.
   */
  const credit = (ago: number, more: Record<string, unknown> = {}) => {
    const bought = new Date(Date.now() - ago * DAY - DAY / 24);
    return {
      id: 'c1',
      userId: 'u1',
      source: 'payment',
      provider: 'stripe',
      externalRef: 'pi_1',
      amountPaid: 3600,
      currencyPaid: 'GBP',
      refundedAmount: 0,
      refundRequestedAt: asked,
      startsAt: bought,
      createdAt: bought,
      months: 0,
      days: 30,
      ...more,
    };
  };

  /**
   * Asks for the credit's refund.
   * @param found - The credit as the store gives it back
   * @param stripe - Stripe, if any
   * @returns Where it sent the buyer, and what it audited
   */
  async function cancel(found: unknown, stripe: StripeGateway | undefined, form: Record<string, string> = {}) {
    const record = vi.fn(() => Promise.resolve());
    const run = actions.refund;
    if (run === undefined) throw new Error('No refund action');
    const error = await thrown(() =>
      run(
        fakeEvent<RefundEvent>({
          url: 'https://catalogue.test/subscription?/refund',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ credit: 'c1', confirmed: 'yes', ...form }).toString(),
          locals: {
            user: USER as never,
            session: {} as never,
            stripe,
            subscriptions: { requestRefund: () => Promise.resolve(found) } as unknown as SubscriptionStore,
            audit: { record } as never,
          },
        }),
      ),
    );
    return { location: isRedirect(error) ? error.location : undefined, record };
  }

  it('refunds the time not yet used at once, through Stripe, once for when it was asked', async () => {
    const stripe = fakeStripe();
    stripe.refund.mockResolvedValue({ id: 're_1' });
    const { location, record } = await cancel(credit(3), stripe);
    expect(location).toBe('/subscription?refund=refunded');
    // 26 whole days of 30 not yet used, as an hour of the 27th has passed, of £36.00.
    expect(stripe.refund).toHaveBeenCalledWith({
      paymentIntent: 'pi_1',
      amount: 3120,
      creditId: 'c1',
      idempotencyKey: `refund-c1-${asked.toISOString()}`,
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ refundedAtOnce: 3120 }) as unknown }),
    );
  });

  it('refunds time bought on to a running subscription in full, as none of it is used yet', async () => {
    const stripe = fakeStripe();
    stripe.refund.mockResolvedValue({ id: 're_1' });
    await cancel(credit(1, { startsAt: new Date(Date.now() + 180 * DAY) }), stripe);
    expect(stripe.refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 3600 }));
  });

  it.each([
    ['older than 14 days', credit(15)],
    ['not paid through Stripe', credit(1, { provider: 'btcpay' })],
    ['of no payment Stripe names', credit(1, { externalRef: null })],
    ['not asked for', credit(1, { refundRequestedAt: null })],
    ['owing nothing', credit(1, { refundedAmount: 3600 })],
    ['of a payment whose total was not kept', credit(1, { amountPaid: null })],
  ])('leaves a refund %s to an admin', async (_why, found) => {
    const stripe = fakeStripe();
    const { location } = await cancel(found, stripe);
    expect(location).toBe('/subscription?refund=requested');
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('leaves it to an admin where Stripe cannot refund it now, or there is no Stripe', async () => {
    const stripe = fakeStripe();
    stripe.refund.mockRejectedValue(new Error('Stripe is down'));
    expect((await cancel(credit(1), stripe)).location).toBe('/subscription?refund=requested');
    expect((await cancel(credit(1), undefined)).location).toBe('/subscription?refund=requested');
  });
});

describe("a purchase's refund, as its buyer sees it before confirming", () => {
  const DAY = 24 * 60 * 60 * 1000;
  type Preview = {
    amount: number;
    days: number;
    of: number;
    atOnce: boolean;
    endsSubscription: boolean;
    countedFrom: Date;
  } | null;

  /**
   * The page's preview of one purchase's refund.
   * @param more - The credit, beside a £36.00 purchase of 30 days, through Stripe, bought and started a day ago
   * @param subscribed - The buyer's entitlement
   * @param locals - What the request has besides
   * @returns The preview
   */
  async function previewed(
    more: Record<string, unknown>,
    subscribed: Record<string, unknown> = {},
    locals: Partial<App.Locals> = {},
  ): Promise<Preview> {
    // A day ago and an hour more, so that the whole days left of it cannot change as the test runs.
    const bought = new Date(Date.now() - DAY - DAY / 24);
    const credit = {
      id: 'c1',
      userId: 'u1',
      source: 'payment',
      provider: 'stripe',
      externalRef: 'pi_1',
      amountPaid: 3600,
      currencyPaid: 'GBP',
      refundedAmount: 0,
      refundedAt: null,
      refundRequestedAt: null,
      disputed: null,
      months: 0,
      days: 30,
      startsAt: bought,
      endsAt: new Date(bought.getTime() + 30 * DAY),
      createdAt: bought,
      ...more,
    };
    const result = (await load(
      fakeEvent<LoadEvent>({
        url: 'https://catalogue.test/subscription',
        locals: {
          user: USER as never,
          session: {} as never,
          isAdmin: false,
          stripe: fakeStripe(),
          entitlement: () =>
            Promise.resolve({ paidUntil: credit.endsAt, active: true, patreon: false, entitled: true, ...subscribed }),
          subscriptions: {
            history: () => Promise.resolve([credit]),
            activeOffers: () => Promise.resolve([]),
            processingCheckouts: () => Promise.resolve([]),
          } as unknown as SubscriptionStore,
          ...locals,
        },
      }),
    )) as unknown as { history: { preview: Preview }[] };
    return result.history[0]?.preview ?? null;
  }

  it('is the pro rata refund, made at once within 14 days of buying, and warns it ends the subscription', async () => {
    const preview = await previewed({});
    // An hour of the 29th day not yet used has passed: 28 whole days, of £36.00.
    expect(preview).toMatchObject({ amount: 3360, days: 28, of: 30, atOnce: true, endsSubscription: true });
    expect(preview?.countedFrom.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('counts from when time bought on to a running subscription starts, and keeps it running', async () => {
    const later = new Date(Date.now() + 60 * DAY);
    const preview = await previewed(
      { startsAt: later, endsAt: new Date(later.getTime() + 30 * DAY) },
      { paidUntil: new Date(later.getTime() + 30 * DAY) },
    );
    expect(preview).toMatchObject({ amount: 3600, days: 30, countedFrom: later, endsSubscription: false });
  });

  it("is an admin's to make after 14 days, or for a payment not through Stripe, or where there is no Stripe", async () => {
    expect(await previewed({ createdAt: new Date(Date.now() - 15 * DAY) })).toMatchObject({ atOnce: false });
    expect(await previewed({ provider: 'btcpay' })).toMatchObject({ atOnce: false });
    expect(await previewed({}, {}, { stripe: undefined })).toMatchObject({ atOnce: false });
  });

  it('ends nothing for a patron Patreon subscribes, or an admin', async () => {
    expect(await previewed({}, { patreon: true })).toMatchObject({ endsSubscription: false });
    expect(await previewed({}, {}, { isAdmin: true })).toMatchObject({ endsSubscription: false });
    expect(await previewed({}, { paidUntil: null })).toMatchObject({ endsSubscription: true });
  });

  it('is none where no refund can be asked for, or its currency was not kept', async () => {
    expect(await previewed({ refundedAmount: 3600 })).toBeNull();
    expect(await previewed({ source: 'grant' })).toBeNull();
    expect(await previewed({ currencyPaid: null })).toBeNull();
  });
});
