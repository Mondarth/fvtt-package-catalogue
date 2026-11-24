import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { POST } from '../../../src/routes/webhooks/stripe/+server.js';
import { invoke } from '../support/event.js';

import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { PaymentEvent, StripeGateway } from '../../../src/lib/server/subscriptions/stripe.js';
import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

type WebhookEvent = Parameters<typeof POST>[0];

/**
 * A Stripe that reads every event as the one given, or none as signed.
 * @param event - What it reads, or none
 * @returns The gateway
 */
function stripeReading(event: PaymentEvent | undefined) {
  return {
    currency: 'GBP',
    offerPrice: vi.fn<StripeGateway['offerPrice']>(),
    retireOfferPrice: vi.fn<StripeGateway['retireOfferPrice']>(),
    checkout: vi.fn<StripeGateway['checkout']>(),
    refund: vi.fn<StripeGateway['refund']>(),
    event: vi.fn<StripeGateway['event']>(() => event),
  };
}

/**
 * Posts an event to the webhook.
 * @param stripe - The gateway, if any
 * @param subscriptions - The store
 * @returns What it answered, or the error it threw
 */
async function post(stripe: StripeGateway | undefined, subscriptions: Partial<SubscriptionStore> = {}) {
  try {
    return await invoke<WebhookEvent>(POST, {
      url: 'https://catalogue.test/webhooks/stripe',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=abc' },
      body: '{"id":"evt_1"}',
      locals: {
        stripe,
        subscriptions: subscriptions as SubscriptionStore,
        audit: { record: () => Promise.resolve() } as unknown as AuditStore,
      },
    });
  } catch (error) {
    return error;
  }
}

describe("Stripe's webhook", () => {
  it('reads the raw body with its signature, and applies the event', async () => {
    const stripe = stripeReading({ kind: 'ignored', type: 'charge.succeeded' });
    const answer = await post(stripe);
    expect(answer instanceof Response && (await answer.json())).toEqual({ received: true, applied: 'ignored' });
    expect(stripe.event).toHaveBeenCalledWith('{"id":"evt_1"}', 't=1,v1=abc');
  });

  it("applies a purchase's event to it", async () => {
    const checkoutOf = vi.fn(() => Promise.resolve(undefined));
    const answer = await post(stripeReading({ kind: 'expired', checkoutId: 'k1', sessionId: 'cs_1' }), { checkoutOf });
    expect(answer instanceof Response && (await answer.json())).toEqual({ received: true, applied: 'unknown' });
    expect(checkoutOf).toHaveBeenCalledWith('stripe', 'k1', 'cs_1');
  });

  it('refuses an event Stripe did not sign', async () => {
    const error = await post(stripeReading(undefined));
    expect(isHttpError(error) && error.status).toBe(400);
  });

  it('is not there while the catalogue sells nothing through Stripe', async () => {
    const error = await post(undefined);
    expect(isHttpError(error) && error.status).toBe(404);
  });
});
