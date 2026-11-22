import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions as offerActions, load as offersLoad } from '../../../src/routes/admin/subscriptions/+page.server.js';
import { actions as userActions } from '../../../src/routes/admin/users/[id]/+page.server.js';
import { load as subscriptionLoad } from '../../../src/routes/subscription/+page.server.js';
import { fakeEvent } from '../support/event.js';

import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { AccountsStore } from '../../../src/lib/server/accounts/store.js';
import type { StripeGateway } from '../../../src/lib/server/subscriptions/stripe.js';
import type { Credit, Offer, SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

const USER = { id: 'u1', handle: 'amber-fox-oak-01' };
const ADMIN = { id: 'admin', handle: 'admin-handle' };
const BEFORE = new Date('2026-12-01T00:00:00Z');
const AFTER = new Date('2027-12-01T00:00:00Z');

const aCredit = (more: Partial<Credit> = {}): Credit => ({
  id: 'c1',
  userId: 'u1',
  source: 'grant',
  provider: null,
  method: null,
  externalRef: null,
  providerAccount: null,
  offerId: null,
  amountPaid: null,
  currencyPaid: null,
  months: 12,
  days: 0,
  startsAt: BEFORE,
  endsAt: AFTER,
  grantedBy: 'admin',
  note: 'secret note',
  createdAt: BEFORE,
  ...more,
});

const offer = (more: Partial<Offer> = {}): Offer => ({
  id: 'o1',
  name: '12 months',
  months: 12,
  days: 0,
  prices: { GBP: 3000 },
  providers: [],
  providerRefs: {},
  availableFrom: null,
  availableUntil: null,
  retiredAt: null,
  createdBy: 'admin',
  createdAt: BEFORE,
  ...more,
});

/** What a load or action threw, which SvelteKit's redirect and error are. */
async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

type SubscriptionEvent = Parameters<typeof subscriptionLoad>[0];
type OffersEvent = Parameters<typeof offersLoad>[0];
type OfferEvent = Parameters<NonNullable<(typeof offerActions)['create']>>[0];
type UserEvent = Parameters<NonNullable<(typeof userActions)['grant']>>[0];

describe('the subscription page', () => {
  it('gives the user their subscription, its time without admins’ notes, and the offers on sale', async () => {
    const result = await subscriptionLoad(
      fakeEvent<SubscriptionEvent>({
        locals: {
          user: USER as never,
          isAdmin: false,
          entitlement: () => Promise.resolve({ paidUntil: AFTER, active: true, patreon: false, entitled: true }),
          subscriptions: {
            history: () =>
              Promise.resolve([
                aCredit(),
                aCredit({ id: 'c2', source: 'payment', amountPaid: 3600, currencyPaid: 'GBP' }),
              ]),
            activeOffers: () => Promise.resolve([offer()]),
            processingCheckouts: () => Promise.resolve([]),
          } as unknown as SubscriptionStore,
        },
      }),
    );
    expect(result).toEqual({
      entitlement: { paidUntil: AFTER, active: true, patreon: false, entitled: true },
      admin: false,
      history: [
        {
          id: 'c1',
          source: 'grant',
          startsAt: BEFORE,
          endsAt: AFTER,
          months: 12,
          days: 0,
          purchasedAt: BEFORE,
          paid: null,
        },
        {
          id: 'c2',
          source: 'payment',
          startsAt: BEFORE,
          endsAt: AFTER,
          months: 12,
          days: 0,
          purchasedAt: BEFORE,
          paid: { amount: 3600, currency: 'GBP' },
        },
      ],
      offers: [{ id: 'o1', name: '12 months', months: 12, days: 0, prices: { GBP: 3000 }, stripePrice: null }],
      canBuy: false,
      processing: 0,
      checkout: null,
      patreon: null,
      patreonDone: null,
      patreonError: null,
    });
  });

  it('is the sign-in page for anyone not signed in', async () => {
    const error = await thrown(() => subscriptionLoad(fakeEvent<SubscriptionEvent>({ locals: { user: null } })));
    expect(isRedirect(error) && error.location).toBe('/');
  });
});

describe("a user's admin page's subscription actions", () => {
  const record = vi.fn<AuditStore['record']>(() => Promise.resolve());

  function act(
    action: 'grant' | 'setEnd' | 'revoke',
    form: Record<string, string>,
    store: Partial<SubscriptionStore>,
    found = true,
  ) {
    const run = userActions[action];
    if (run === undefined) throw new Error(`No ${action} action`);
    return run(
      fakeEvent<UserEvent>({
        url: `http://catalogue.test/admin/users/u1?/${action}`,
        method: 'POST',
        params: { id: 'u1' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        locals: {
          user: ADMIN as never,
          accounts: {
            userDetail: () => Promise.resolve(found ? { id: 'u1' } : undefined),
          } as unknown as AccountsStore,
          subscriptions: {
            status: () => Promise.resolve({ paidUntil: BEFORE, active: true }),
            ...store,
          } as SubscriptionStore,
          audit: { record } as unknown as AuditStore,
        },
      }),
    );
  }

  it('grants time, recording how the subscription ended and ends', async () => {
    const credit = vi.fn<SubscriptionStore['credit']>(() => Promise.resolve(aCredit()));
    const error = await thrown(() => act('grant', { months: '12', days: '', note: ' Goodwill ' }, { credit }));
    expect(isRedirect(error) && error.location).toBe('/admin/users/u1?done=grant');
    expect(credit).toHaveBeenCalledWith({
      userId: 'u1',
      source: 'grant',
      months: 12,
      days: 0,
      grantedBy: 'admin',
      note: 'Goodwill',
    });
    expect(record).toHaveBeenLastCalledWith({
      actorId: 'admin',
      action: 'subscription.grant',
      subjectId: 'u1',
      before: { paidUntil: BEFORE.toISOString() },
      after: { paidUntil: AFTER.toISOString(), note: 'Goodwill' },
      requestId: 'request-1',
    });
  });

  it('records a first grant as from no subscription at all', async () => {
    const credit = vi.fn<SubscriptionStore['credit']>(() => Promise.resolve(aCredit()));
    const status = () => Promise.resolve({ paidUntil: null, active: false });
    await thrown(() => act('grant', { months: '1' }, { credit, status }));
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ before: { paidUntil: null }, after: { paidUntil: AFTER.toISOString() } }),
    );
  });

  it('refuses a period there is not, or a note too long, without granting', async () => {
    const credit = vi.fn<SubscriptionStore['credit']>();
    expect(await act('grant', { months: '0', days: '0' }, { credit })).toMatchObject({
      status: 400,
      data: { problem: 'period' },
    });
    expect(await act('grant', { months: 'x', days: '1' }, { credit })).toMatchObject({ data: { problem: 'period' } });
    expect(await act('grant', { months: '1', note: 'x'.repeat(201) }, { credit })).toMatchObject({
      data: { problem: 'note' },
    });
    expect(credit).not.toHaveBeenCalled();
  });

  it('sets the end, at the start of the day given, and records it', async () => {
    const setEnd = vi.fn<SubscriptionStore['setEnd']>(() => Promise.resolve({ before: BEFORE, after: AFTER }));
    const error = await thrown(() => act('setEnd', { end: '2027-12-01', note: '' }, { setEnd }));
    expect(isRedirect(error) && error.location).toBe('/admin/users/u1?done=setEnd');
    expect(setEnd).toHaveBeenCalledWith('u1', AFTER, 'admin', null);
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'subscription.set-end', after: { paidUntil: AFTER.toISOString() } }),
    );
  });

  it('refuses an end that is not a day', async () => {
    const setEnd = vi.fn<SubscriptionStore['setEnd']>();
    for (const end of ['', 'soon', '2027-13-45']) {
      const result = await act('setEnd', { end }, { setEnd });
      expect(isActionFailure(result) && result.data).toMatchObject({ problem: 'date' });
    }
    expect(setEnd).not.toHaveBeenCalled();
  });

  it('ends it now, recording it as revoked', async () => {
    const setEnd = vi.fn<SubscriptionStore['setEnd']>(() => Promise.resolve({ before: AFTER, after: null }));
    const error = await thrown(() => act('revoke', {}, { setEnd }));
    expect(isRedirect(error) && error.location).toBe('/admin/users/u1?done=revoke');
    expect(setEnd.mock.calls[0]?.[0]).toBe('u1');
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'subscription.revoke', after: { paidUntil: null } }),
    );
  });

  it.each(['grant', 'setEnd', 'revoke'] as const)('%s is not found for a user there is not', async action => {
    const error = await thrown(() => act(action, { months: '1', end: '2027-01-01' }, {}, false));
    expect(error).toMatchObject({ status: 404 });
  });
});

describe('the offers page', () => {
  const record = vi.fn<AuditStore['record']>(() => Promise.resolve());

  it('lists the offers, and says what was done', async () => {
    const offers = vi.fn(() => Promise.resolve([offer()]));
    const result = await offersLoad(
      fakeEvent<OffersEvent>({
        url: 'http://catalogue.test/admin/subscriptions?done=create',
        locals: { subscriptions: { offers } as unknown as SubscriptionStore },
      }),
    );
    expect(result).toEqual({ offers: [offer()], stripeCurrency: null, patreonMinimum: undefined, done: 'create' });
  });

  function act(
    action: 'create' | 'retire',
    form: Record<string, string>,
    store: Partial<SubscriptionStore>,
    stripe?: StripeGateway,
  ) {
    const run = offerActions[action];
    if (run === undefined) throw new Error(`No ${action} action`);
    return run(
      fakeEvent<OfferEvent>({
        url: `http://catalogue.test/admin/subscriptions?/${action}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        locals: {
          user: ADMIN as never,
          subscriptions: store as SubscriptionStore,
          audit: { record } as unknown as AuditStore,
          stripe,
        },
      }),
    );
  }

  const valid = { name: ' 12 months ', months: '12', days: '', prices: 'GBP 30.00\nEUR 35', from: '', until: '' };

  it('makes an offer, and records it', async () => {
    const createOffer = vi.fn<SubscriptionStore['createOffer']>(() => Promise.resolve(offer()));
    const error = await thrown(() =>
      act('create', { ...valid, from: '2027-01-01', until: '2027-02-01' }, { createOffer }),
    );
    expect(isRedirect(error) && error.location).toBe('/admin/subscriptions?done=create');
    expect(createOffer).toHaveBeenCalledWith({
      id: expect.any(String) as string,
      name: '12 months',
      months: 12,
      days: 0,
      prices: { GBP: 3000, EUR: 3500 },
      availableFrom: new Date('2027-01-01T00:00:00Z'),
      availableUntil: new Date('2027-02-01T00:00:00Z'),
      createdBy: 'admin',
    });
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'offer.create', actorId: 'admin' }));
  });

  /** A Stripe that makes each offer's Product and Price, or fails as told. */
  function fakeStripe(fails = false) {
    return {
      currency: 'GBP',
      offerPrice: vi.fn<StripeGateway['offerPrice']>(() =>
        fails ? Promise.reject(new Error('Stripe is down')) : Promise.resolve({ product: 'prod_1', price: 'price_1' }),
      ),
      retireOfferPrice: vi.fn<StripeGateway['retireOfferPrice']>(() =>
        fails ? Promise.reject(new Error('Stripe is down')) : Promise.resolve(),
      ),
      checkout: vi.fn<StripeGateway['checkout']>(),
      event: vi.fn<StripeGateway['event']>(),
    };
  }

  it('makes an offer with a price in the Stripe currency a Stripe Product and Price, and sells it through Stripe', async () => {
    const stripe = fakeStripe();
    const createOffer = vi.fn<SubscriptionStore['createOffer']>(() =>
      Promise.resolve(offer({ providers: ['stripe'] })),
    );
    await thrown(() => act('create', valid, { createOffer }, stripe));
    const [made] = createOffer.mock.calls[0] ?? [];
    expect(stripe.offerPrice).toHaveBeenCalledWith({ offerId: made?.id, name: '12 months', amount: 3000 });
    expect(made).toMatchObject({
      providers: ['stripe'],
      providerRefs: { stripe: { product: 'prod_1', price: 'price_1' } },
    });
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'offer.create',
        after: expect.objectContaining({ providers: ['stripe'] }) as unknown,
      }),
    );

    // One without a price in it is not put to Stripe.
    createOffer.mockClear();
    await thrown(() => act('create', { ...valid, prices: 'EUR 35' }, { createOffer }, stripe));
    expect(stripe.offerPrice).toHaveBeenCalledOnce();
    expect(createOffer.mock.calls[0]?.[0]).not.toHaveProperty('providers');
  });

  it('makes no offer when Stripe cannot make its Product and Price', async () => {
    const createOffer = vi.fn<SubscriptionStore['createOffer']>();
    const result = await act('create', valid, { createOffer }, fakeStripe(true));
    expect(isActionFailure(result) && result.status).toBe(502);
    expect(isActionFailure(result) && result.data).toMatchObject({ problem: 'stripe', name: '12 months' });
    expect(createOffer).not.toHaveBeenCalled();
  });

  it("archives a retired offer's Stripe Price and Product, and retires it all the same when Stripe cannot", async () => {
    const refs = { product: 'prod_1', price: 'price_1' };
    const retireOffer = () => Promise.resolve(offer({ retiredAt: AFTER, providerRefs: { stripe: refs } }));
    const stripe = fakeStripe();
    await thrown(() => act('retire', { offer: 'o1' }, { retireOffer }, stripe));
    expect(stripe.retireOfferPrice).toHaveBeenCalledWith(refs);

    record.mockClear();
    const error = await thrown(() => act('retire', { offer: 'o1' }, { retireOffer }, fakeStripe(true)));
    expect(isRedirect(error) && error.location).toBe('/admin/subscriptions?done=retire');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'offer.retire' }));
  });

  it.each([
    [{ name: '' }, 'name'],
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ months: '0', days: '0' }, 'period'],
    [{ prices: 'GBP thirty' }, 'prices'],
    [{ from: '2027-02-01', until: '2027-01-01' }, 'dates'],
  ])('refuses %o, keeping what was given', async (change, problem) => {
    const createOffer = vi.fn<SubscriptionStore['createOffer']>();
    const result = await act('create', { ...valid, ...change }, { createOffer });
    const name = 'name' in change ? change.name : valid.name;
    expect(isActionFailure(result) && result.data).toMatchObject({ problem, name: name.trim() });
    expect(createOffer).not.toHaveBeenCalled();
  });

  it('takes a date that is not one as none', async () => {
    const createOffer = vi.fn<SubscriptionStore['createOffer']>(() => Promise.resolve(offer()));
    await thrown(() => act('create', { ...valid, from: '2027-02-30x', until: 'later' }, { createOffer }));
    expect(createOffer).toHaveBeenCalledWith(expect.objectContaining({ availableFrom: null, availableUntil: null }));
  });

  it('retires an offer, recording it once', async () => {
    record.mockClear();
    const retireOffer = vi.fn<SubscriptionStore['retireOffer']>(() => Promise.resolve(offer({ retiredAt: AFTER })));
    const error = await thrown(() => act('retire', { offer: 'o1' }, { retireOffer }));
    expect(isRedirect(error) && error.location).toBe('/admin/subscriptions?done=retire');
    expect(retireOffer).toHaveBeenCalledWith('o1');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'offer.retire', before: { offer: 'o1', name: '12 months' } }),
    );

    record.mockClear();
    await thrown(() => act('retire', { offer: 'o1' }, { retireOffer: () => Promise.resolve(undefined) }));
    expect(record).not.toHaveBeenCalled();
  });
});
