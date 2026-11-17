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
