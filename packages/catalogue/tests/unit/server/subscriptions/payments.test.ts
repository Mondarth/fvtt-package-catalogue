import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '../../../../src/lib/server/accounts/schema.js';
import { STRIPE_ACTOR, applyStripeEvent } from '../../../../src/lib/server/subscriptions/payments.js';
import { subscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';
import { memoryLogger } from '../../support/logger.js';
import { testDatabase } from '../../support/pglite.js';

import type { AuditStore } from '../../../../src/lib/server/accounts/audit.js';
import type { Database } from '../../../../src/lib/server/db/database.js';
import type { PaymentEvent } from '../../../../src/lib/server/subscriptions/stripe.js';
import type { Checkout, SubscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';

let db: Database;
let close: () => Promise<void>;
let subscriptions: SubscriptionStore;
let begun: Checkout;
const record = vi.fn<AuditStore['record']>(() => Promise.resolve());
const audit = { record } as unknown as AuditStore;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  subscriptions = subscriptionStore(db);
  await db.insert(users).values({ id: 'u1', name: 'One', email: 'one@example.test', handle: 'amber-fox-oak-01' });
  const offer = await subscriptions.createOffer({
    name: '1 month',
    months: 1,
    days: 0,
    prices: { GBP: 300 },
    createdBy: 'admin',
  });
  begun = await subscriptions.openCheckout({
    userId: 'u1',
    offerId: offer.id,
    provider: 'stripe',
    consentedAt: new Date(),
  });
  await subscriptions.attachSession(begun.id, 'cs_1');
  record.mockClear();
});

afterEach(() => close());

/**
 * Applies an event, with a logger to read back.
 * @param event - The event
 * @returns What it came to, and what was logged
 */
async function apply(event: PaymentEvent) {
  const log = memoryLogger();
  const applied = await applyStripeEvent(event, { subscriptions, audit, log });
  return { applied, log };
}

const paid = (paymentIntent = 'pi_1'): Extract<PaymentEvent, { kind: 'paid' }> => ({
  kind: 'paid',
  checkoutId: begun.id,
  sessionId: 'cs_1',
  paymentIntent,
  mode: 'test',
  amount: 360,
  currency: 'GBP',
});

describe("a Stripe event's purchase", () => {
  it("credits a paid one's offer's period once, by its PaymentIntent, and records who paid by whom", async () => {
    expect((await apply(paid())).applied).toBe('credited');
    const [credit] = await subscriptions.history('u1');
    expect(credit).toMatchObject({
      source: 'payment',
      provider: 'stripe',
      externalRef: 'pi_1',
      providerAccount: 'test',
      offerId: begun.offerId,
      amountPaid: 360,
      currencyPaid: 'GBP',
      months: 1,
      days: 0,
    });
    expect(await subscriptions.checkoutOf('stripe', begun.id, 'cs_1')).toMatchObject({
      status: 'paid',
      creditId: credit?.id,
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: STRIPE_ACTOR,
        action: 'payment.credit',
        subjectId: 'u1',
        after: expect.objectContaining({ paymentIntent: 'pi_1', mode: 'test', name: '1 month' }) as unknown,
      }),
    );

    // Stripe says so again, as it may: nothing more is credited or recorded.
    record.mockClear();
    expect((await apply(paid())).applied).toBe('duplicate');
    expect(await subscriptions.history('u1')).toHaveLength(1);
    expect(record).not.toHaveBeenCalled();
  });

  it('finds the purchase by its session where the event names none of its own', async () => {
    expect((await apply({ ...paid(), checkoutId: undefined })).applied).toBe('credited');
  });

  it.each(['processing', 'failed', 'expired'] as const)('marks a %s one so, crediting nothing', async kind => {
    expect((await apply({ kind, checkoutId: begun.id, sessionId: 'cs_1' })).applied).toBe('settled');
    expect(await subscriptions.checkoutOf('stripe', begun.id, 'cs_1')).toMatchObject({ status: kind });
    expect(await subscriptions.history('u1')).toEqual([]);
  });

  it('leaves alone, and logs, a checkout the catalogue did not begin', async () => {
    const { applied, log } = await apply({
      kind: 'paid',
      checkoutId: undefined,
      sessionId: 'cs_x',
      paymentIntent: 'pi_x',
      mode: 'live',
      amount: null,
      currency: null,
    });
    expect(applied).toBe('unknown');
    expect(log.lines.map(line => [line.level, line.msg ?? line.message])).toContainEqual([
      'warn',
      'Stripe event of a checkout the catalogue did not begin',
    ]);
    expect(await subscriptions.history('u1')).toEqual([]);
  });

  it('ignores what buys nothing', async () => {
    expect((await apply({ kind: 'ignored', type: 'charge.succeeded' })).applied).toBe('ignored');
  });
});
