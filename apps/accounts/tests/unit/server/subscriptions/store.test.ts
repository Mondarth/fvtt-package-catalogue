import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../../../src/lib/server/accounts/schema.js';
import { subscriptionCredits } from '../../../../src/lib/server/subscriptions/schema.js';
import { subscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';
import { testDatabase } from '../../support/pglite.js';

import type { Database } from '../../../../src/lib/server/db/database.js';
import type { SubscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';

let db: Database;
let close: () => Promise<void>;
let store: SubscriptionStore;

const NOW = new Date('2026-11-16T12:00:00Z');
const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  store = subscriptionStore(db);
  await db.insert(users).values([
    { id: 'u1', name: 'One', email: 'one@example.test', handle: 'amber-fox-oak-01' },
    { id: 'u2', name: 'Two', email: 'two@example.test', handle: 'bold-owl-elm-02' },
  ]);
});

afterEach(() => close());

describe('a subscription', () => {
  it('is none for a user never credited', async () => {
    expect(await store.status('u1', NOW)).toEqual({ paidUntil: null, active: false });
    expect(await store.history('u1')).toEqual([]);
  });

  it('runs from now for the period granted', async () => {
    const made = await store.credit({ userId: 'u1', source: 'grant', months: 12, days: 0, grantedBy: 'admin' }, NOW);
    expect(made).toMatchObject({
      startsAt: NOW,
      endsAt: at('2027-11-16T12:00:00Z'),
      grantedBy: 'admin',
      source: 'grant',
    });
    expect(await store.status('u1', NOW)).toEqual({ paidUntil: at('2027-11-16T12:00:00Z'), active: true });
  });

  it('adds time bought before it ends to its end, and time bought after it ended from now', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, NOW);
    const next = await store.credit({ userId: 'u1', source: 'grant', months: 0, days: 10 }, NOW);
    expect(next).toMatchObject({ startsAt: at('2026-12-16T12:00:00Z'), endsAt: at('2026-12-26T12:00:00Z') });

    const later = at('2027-03-01T00:00:00Z');
    expect(await store.status('u1', later)).toMatchObject({ active: false });
    const again = await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, later);
    expect(again).toMatchObject({ startsAt: later, endsAt: at('2027-04-01T00:00:00Z') });
  });

  it('keeps each user apart', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, NOW);
    expect(await store.status('u2', NOW)).toEqual({ paidUntil: null, active: false });
  });

  it('credits a payment once, however often its provider says so', async () => {
    const payment = {
      userId: 'u1',
      source: 'payment' as const,
      provider: 'btcpay',
      method: 'xmr',
      externalRef: 'inv-1',
      providerAccount: 'store-1',
      months: 12,
      days: 0,
    };
    expect(await store.credit(payment, NOW)).toMatchObject({ provider: 'btcpay', externalRef: 'inv-1', method: 'xmr' });
    expect(await store.credit(payment, NOW)).toBe('duplicate');
    expect(await store.history('u1')).toHaveLength(1);
    // The same reference with another provider is another payment.
    expect(await store.credit({ ...payment, provider: 'stripe' }, NOW)).not.toBe('duplicate');
  });

  it('passes any other failure on', async () => {
    await expect(store.credit({ userId: 'nobody', source: 'grant', months: 1, days: 0 }, NOW)).rejects.toThrow();
  });

  it('lists its credits, the latest first', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0, note: 'first' }, NOW);
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0, note: 'second' }, NOW);
    expect((await store.history('u1')).map(credit => credit.note)).toEqual(['second', 'first']);
  });

  it('is gone with the profile', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, NOW);
    await db.delete(users);
    expect(await db.select().from(subscriptionCredits)).toEqual([]);
  });
});

describe('setting when a subscription ends', () => {
  it('adds a granted credit to reach a later end, from its end or from now', async () => {
    const end = at('2027-01-01T00:00:00Z');
    expect(await store.setEnd('u1', end, 'admin', 'Goodwill', NOW)).toEqual({ before: null, after: end });
    const [credit] = await store.history('u1');
    expect(credit).toMatchObject({ source: 'grant', startsAt: NOW, endsAt: end, grantedBy: 'admin', note: 'Goodwill' });

    const later = at('2027-02-01T00:00:00Z');
    await store.setEnd('u1', later, 'admin', null, NOW);
    expect((await store.history('u1'))[0]).toMatchObject({ startsAt: end, endsAt: later, note: null });
  });

  it('cuts every credit back to an earlier end, keeping who granted or paid for each', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0, grantedBy: 'first-admin' }, NOW);
    await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, NOW);
    const end = at('2026-12-01T00:00:00Z');
    expect(await store.setEnd('u1', end, 'admin', null, NOW)).toEqual({
      before: at('2027-01-16T12:00:00Z'),
      after: end,
    });
    const [second, first] = await store.history('u1');
    expect(first).toMatchObject({ endsAt: end, grantedBy: 'first-admin' });
    // One that started after the end is left as nothing, at the end.
    expect(second).toMatchObject({ startsAt: end, endsAt: end });
    expect(await store.status('u1', NOW)).toEqual({ paidUntil: end, active: true });
  });

  it('ends it now, which is revoking it', async () => {
    await store.credit({ userId: 'u1', source: 'grant', months: 12, days: 0 }, NOW);
    await store.setEnd('u1', NOW, 'admin', null, NOW);
    expect(await store.status('u1', NOW)).toEqual({ paidUntil: NOW, active: false });
  });
});

describe('offers', () => {
  const offer = { name: '12 months', months: 12, days: 0, prices: { GBP: 3000, EUR: 3500 }, createdBy: 'admin' };

  it('are made, and listed, the newest first', async () => {
    const made = await store.createOffer(offer);
    expect(made).toMatchObject({ ...offer, providers: [], retiredAt: null, availableFrom: null, availableUntil: null });
    expect(await store.offers()).toEqual([made]);
  });

  it('are on sale until retired, and within the dates they are given', async () => {
    const always = await store.createOffer(offer);
    const soon = await store.createOffer({ ...offer, name: 'Soon', availableFrom: at('2027-01-01T00:00:00Z') });
    const ended = await store.createOffer({ ...offer, name: 'Ended', availableUntil: at('2026-11-01T00:00:00Z') });
    const short = await store.createOffer({ ...offer, name: 'One month', months: 1 });
    expect((await store.activeOffers(NOW)).map(found => found.name)).toEqual(['One month', '12 months']);

    expect(await store.retireOffer(always.id, NOW)).toMatchObject({ retiredAt: NOW });
    expect(await store.retireOffer(always.id, NOW)).toBeUndefined();
    expect((await store.activeOffers(NOW)).map(found => found.id)).toEqual([short.id]);
    expect((await store.activeOffers(at('2027-02-01T00:00:00Z'))).map(found => found.id).sort()).toEqual(
      [short.id, soon.id].sort(),
    );
    expect(ended.availableUntil).toEqual(at('2026-11-01T00:00:00Z'));
  });

  it('are read with the time now by default', async () => {
    await store.createOffer(offer);
    expect(await store.activeOffers()).toHaveLength(1);
    expect((await store.status('u1')).active).toBe(false);
  });

  it('name the offer a credit was bought by', async () => {
    const made = await store.createOffer(offer);
    expect(
      await store.credit({ userId: 'u1', source: 'payment', offerId: made.id, months: 12, days: 0 }, NOW),
    ).toMatchObject({ offerId: made.id });
  });
});

describe('offers sold through a provider', () => {
  const offer = { name: '12 months', months: 12, days: 0, prices: { GBP: 3000 }, createdBy: 'admin' };

  it('keep the id they were put to it by, and what it knows them by; an offer is found retired or not', async () => {
    const refs = { stripe: { product: 'prod_1', price: 'price_1' } };
    const made = await store.createOffer({ ...offer, id: 'o-stripe', providers: ['stripe'], providerRefs: refs });
    expect(made).toMatchObject({ id: 'o-stripe', providers: ['stripe'], providerRefs: refs });
    expect((await store.createOffer(offer)).providerRefs).toEqual({});
    await store.retireOffer('o-stripe', NOW);
    expect(await store.offer('o-stripe')).toMatchObject({ id: 'o-stripe', retiredAt: NOW });
    expect(await store.offer('none')).toBeUndefined();
  });
});

describe('checkouts', () => {
  const offer = { name: '12 months', months: 12, days: 0, prices: { GBP: 3000 }, createdBy: 'admin' };

  it('are begun with the consent, found by their id or their session, and settled once', async () => {
    const { id: offerId } = await store.createOffer(offer);
    const begun = await store.openCheckout({ userId: 'u1', offerId, provider: 'stripe', consentedAt: NOW });
    expect(begun).toMatchObject({ userId: 'u1', offerId, status: 'open', sessionId: null, consentedAt: NOW });

    await store.attachSession(begun.id, 'cs_1');
    expect(await store.checkoutOf('stripe', begun.id, 'cs_other')).toMatchObject({ id: begun.id, sessionId: 'cs_1' });
    expect(await store.checkoutOf('stripe', undefined, 'cs_1')).toMatchObject({ id: begun.id });
    expect(await store.checkoutOf('stripe', 'none', 'cs_1')).toMatchObject({ id: begun.id });
    expect(await store.checkoutOf('paypal', begun.id, 'cs_1')).toBeUndefined();
    expect(await store.checkoutOf('stripe', undefined, 'cs_none')).toBeUndefined();

    await store.settleCheckout(begun.id, 'processing', undefined, NOW);
    expect(await store.processingCheckouts('u1')).toMatchObject([{ id: begun.id, status: 'processing' }]);
    expect(await store.processingCheckouts('u2')).toEqual([]);

    const credit = await store.credit(
      { userId: 'u1', source: 'payment', provider: 'stripe', externalRef: 'pi_1', offerId, months: 12, days: 0 },
      NOW,
    );
    if (credit === 'duplicate') throw new Error('Credited already');
    await store.settleCheckout(begun.id, 'paid', credit.id);
    // Paid is settled for good: a late event cannot undo it.
    await store.settleCheckout(begun.id, 'expired');
    expect(await store.checkoutOf('stripe', begun.id, 'cs_1')).toMatchObject({ status: 'paid', creditId: credit.id });
    expect(await store.processingCheckouts('u1')).toEqual([]);
    expect(await store.creditOf('stripe', 'pi_1')).toMatchObject({ id: credit.id });
    expect(await store.creditOf('stripe', 'pi_none')).toBeUndefined();
  });
});

describe('taking time back', () => {
  /** A payment of £30.00 for 30 days, credited now, after 30 days already granted. */
  async function paid() {
    await store.credit({ userId: 'u1', source: 'grant', months: 0, days: 30 }, NOW);
    const credit = await store.credit(
      {
        userId: 'u1',
        source: 'payment',
        provider: 'stripe',
        externalRef: 'pi_1',
        amountPaid: 3000,
        currencyPaid: 'GBP',
        months: 0,
        days: 30,
      },
      NOW,
    );
    if (credit === 'duplicate') throw new Error('Credited already');
    return credit;
  }
  const DAY = 24 * 60 * 60 * 1000;
  const days = (n: number) => new Date(NOW.getTime() + n * DAY);

  it("takes a credit's share of days off the end, rounded down, applying only what is newly refunded", async () => {
    const credit = await paid();
    expect(await store.status('u1', NOW)).toMatchObject({ paidUntil: days(60) });

    // A third refunded: 10 days off the end, wherever the credit falls.
    expect(await store.takeBack({ creditId: credit.id, refunded: 1000, amount: 3000 }, NOW)).toEqual({
      days: 10,
      before: days(60),
      after: days(50),
    });
    // Stripe says so again: nothing more.
    expect(await store.takeBack({ creditId: credit.id, refunded: 1000, amount: 3000 }, NOW)).toBe('duplicate');
    // A little more, not a whole day's worth: nothing comes off, but it is recorded.
    expect(await store.takeBack({ creditId: credit.id, refunded: 1050, amount: 3000 }, NOW)).toMatchObject({ days: 0 });
    // The rest: what remains of its 30 days.
    expect(await store.takeBack({ creditId: credit.id, refunded: 3000, amount: 3000 }, NOW)).toMatchObject({
      days: 20,
      after: days(30),
    });
    const [kept] = (await store.history('u1')).filter(found => found.id === credit.id);
    expect(kept).toMatchObject({ refundedAmount: 3000, refundedAt: NOW });
  });

  it('takes back what remains for a dispute lost, recording it, and records a dispute as it changes', async () => {
    const credit = await paid();
    await store.setDisputed(credit.id, 'open');
    await store.takeBack({ creditId: credit.id, refunded: 1500, amount: 3000 }, NOW);
    expect(
      await store.takeBack({ creditId: credit.id, refunded: 3000, amount: 3000, disputed: 'lost' }, NOW),
    ).toMatchObject({
      days: 15,
    });
    expect((await store.creditOf('stripe', 'pi_1'))?.disputed).toBe('lost');
    // A dispute lost after a full refund takes nothing more, but is recorded.
    await store.setDisputed(credit.id, 'won');
    expect(await store.takeBack({ creditId: credit.id, refunded: 3000, amount: 3000, disputed: 'lost' }, NOW)).toBe(
      'duplicate',
    );
    expect((await store.creditOf('stripe', 'pi_1'))?.disputed).toBe('lost');
    expect(await store.takeBack({ creditId: credit.id, refunded: 3000, amount: 3000, disputed: 'lost' }, NOW)).toBe(
      'duplicate',
    );
    expect(await store.takeBack({ creditId: 'none', refunded: 1, amount: 1 }, NOW)).toBeUndefined();
  });

  it('takes back time already used, ending the subscription', async () => {
    const credit = await paid();
    const later = days(55);
    expect(await store.takeBack({ creditId: credit.id, refunded: 3000, amount: 3000 }, later)).toMatchObject({
      after: days(30),
    });
    expect((await store.status('u1', later)).active).toBe(false);
  });
});

describe('refunds asked for', () => {
  it("are recorded once, for a buyer's own paid credit not refunded in full, and listed until refunded", async () => {
    const granted = await store.credit({ userId: 'u1', source: 'grant', months: 1, days: 0 }, NOW);
    const bought = await store.credit(
      {
        userId: 'u1',
        source: 'payment',
        provider: 'stripe',
        externalRef: 'pi_1',
        amountPaid: 3000,
        currencyPaid: 'GBP',
        months: 1,
        days: 0,
      },
      NOW,
    );
    const free = await store.credit({ userId: 'u1', source: 'payment', months: 1, days: 0 }, NOW);
    if (granted === 'duplicate' || bought === 'duplicate' || free === 'duplicate') throw new Error('Credited already');

    expect(await store.requestRefund('u1', granted.id, undefined, NOW)).toBeUndefined();
    expect(await store.requestRefund('u1', free.id, undefined, NOW)).toBeUndefined();
    expect(await store.requestRefund('u2', bought.id, undefined, NOW)).toBeUndefined();
    expect(await store.requestRefund('u1', 'none', undefined, NOW)).toBeUndefined();
    expect(
      await store.requestRefund('u1', bought.id, { reason: 'other', text: 'Moving to another tool' }, NOW),
    ).toMatchObject({ refundRequestedAt: NOW, refundReason: 'other', refundReasonText: 'Moving to another tool' });
    // Asking again changes nothing.
    expect(await store.requestRefund('u1', bought.id, undefined, at('2026-11-17T00:00:00Z'))).toMatchObject({
      refundRequestedAt: NOW,
    });
    expect(await store.refundRequests()).toMatchObject([{ credit: { id: bought.id }, handle: 'amber-fox-oak-01' }]);

    // Partly refunded since: no longer waiting, and may be asked for again.
    const later = at('2026-11-18T00:00:00Z');
    await store.takeBack({ creditId: bought.id, refunded: 1000, amount: 3000 }, later);
    expect(await store.refundRequests()).toEqual([]);
    expect(
      await store.requestRefund(
        'u1',
        bought.id,
        { reason: 'too-expensive', text: 'ignored' },
        at('2026-11-19T00:00:00Z'),
      ),
    ).toMatchObject({
      refundRequestedAt: at('2026-11-19T00:00:00Z'),
      refundReason: 'too-expensive',
      refundReasonText: null,
    });
    expect(await store.refundRequests()).toHaveLength(1);
    // Refunded in full: nothing more to ask for.
    await store.takeBack({ creditId: bought.id, refunded: 3000, amount: 3000 }, at('2026-11-20T00:00:00Z'));
    expect(await store.requestRefund('u1', bought.id)).toBeUndefined();
  });
});

describe('a refund asked for as Other', () => {
  it('keeps no reason where none was given, as for one Stripe could not refund at once', async () => {
    const bought = await store.credit(
      {
        userId: 'u1',
        source: 'payment',
        provider: 'stripe',
        externalRef: 'pi_3',
        amountPaid: 100,
        currencyPaid: 'GBP',
        months: 1,
        days: 0,
      },
      NOW,
    );
    if (bought === 'duplicate') throw new Error('Credited already');
    expect(await store.requestRefund('u1', bought.id, undefined, NOW)).toMatchObject({
      refundReason: null,
      refundReasonText: null,
    });
  });

  it('keeps no words of its own where none were given', async () => {
    const other = await store.credit(
      {
        userId: 'u1',
        source: 'payment',
        provider: 'stripe',
        externalRef: 'pi_2',
        amountPaid: 100,
        currencyPaid: 'GBP',
        months: 1,
        days: 0,
      },
      NOW,
    );
    if (other === 'duplicate') throw new Error('Credited already');
    expect(await store.requestRefund('u1', other.id, { reason: 'other' }, NOW)).toMatchObject({
      refundReason: 'other',
      refundReasonText: null,
    });
  });
});

describe('disputes still being decided', () => {
  it('are listed, the longest open first, keeping when each opened as it is decided, until won or lost', async () => {
    const pay = async (ref: string) => {
      const made = await store.credit(
        {
          userId: 'u1',
          source: 'payment',
          provider: 'stripe',
          externalRef: ref,
          amountPaid: 100,
          currencyPaid: 'GBP',
          months: 1,
          days: 0,
        },
        NOW,
      );
      if (made === 'duplicate') throw new Error('Credited already');
      return made;
    };
    const first = await pay('pi_a');
    const second = await pay('pi_b');
    await store.setDisputed(second.id, 'open', at('2026-11-18T00:00:00Z'));
    await store.setDisputed(first.id, 'open', at('2026-11-17T00:00:00Z'));
    // Still being decided: when it opened is kept.
    await store.setDisputed(first.id, 'open', at('2026-11-19T00:00:00Z'));
    expect((await store.openDisputes()).map(({ credit, handle }) => [credit.id, credit.disputedAt, handle])).toEqual([
      [first.id, at('2026-11-17T00:00:00Z'), 'amber-fox-oak-01'],
      [second.id, at('2026-11-18T00:00:00Z'), 'amber-fox-oak-01'],
    ]);

    await store.setDisputed(first.id, 'won');
    expect((await store.openDisputes()).map(({ credit }) => credit.id)).toEqual([second.id]);
    // Opened again after it was decided: from then.
    await store.setDisputed(first.id, 'open', at('2026-11-20T00:00:00Z'));
    expect((await store.creditOf('stripe', 'pi_a'))?.disputedAt).toEqual(at('2026-11-20T00:00:00Z'));
    await store.setDisputed(second.id, 'lost');
    await store.setDisputed(first.id, 'won');
    expect(await store.openDisputes()).toEqual([]);
    // Taken now by default.
    await store.setDisputed(second.id, 'open');
    expect((await store.creditOf('stripe', 'pi_b'))?.disputedAt?.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('a credit and its checkout', () => {
  it('are found by the credit', async () => {
    const offer = await store.createOffer({
      name: '1 month',
      months: 1,
      days: 0,
      prices: { GBP: 300 },
      createdBy: 'admin',
    });
    const begun = await store.openCheckout({ userId: 'u1', offerId: offer.id, provider: 'stripe', consentedAt: NOW });
    const made = await store.credit(
      { userId: 'u1', source: 'payment', provider: 'stripe', externalRef: 'pi_9', months: 1, days: 0 },
      NOW,
    );
    if (made === 'duplicate') throw new Error('Credited already');
    await store.settleCheckout(begun.id, 'paid', made.id);
    expect(await store.creditById(made.id)).toMatchObject({ id: made.id, externalRef: 'pi_9' });
    expect(await store.creditById('none')).toBeUndefined();
    expect(await store.checkoutOfCredit(made.id)).toMatchObject({ id: begun.id, consentedAt: NOW });
    expect(await store.checkoutOfCredit('none')).toBeUndefined();
  });
});
