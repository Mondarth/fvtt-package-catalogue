import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import {
  STRIPE_API_VERSION,
  stripeDashboardUrl,
  stripeGateway,
} from '../../../../src/lib/server/subscriptions/stripe.js';

const SECRET = 'whsec_test_secret';

/** A request the SDK sent, as Stripe's API would read it. */
interface Sent {
  readonly method: string;
  readonly url: string;
  readonly form: URLSearchParams;
  readonly headers: Headers;
}

/**
 * A fetch that answers as Stripe's API, with what each path gives, and records what was sent.
 * @param answers - What each `METHOD /path` answers with
 * @returns The fetch, and what it was sent
 */
function fakeApi(answers: Readonly<Record<string, unknown>>) {
  const sent: Sent[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    sent.push({
      method,
      url: url.toString(),
      form: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
      headers: new Headers(init?.headers),
    });
    const answer = answers[`${method} ${url.pathname}`];
    return Promise.resolve(
      answer === undefined
        ? new Response(JSON.stringify({ error: { type: 'api_error', message: 'No such path' } }), { status: 500 })
        : new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } }),
    );
  });
  return { fetch, sent };
}

/**
 * The gateway, over a fake API.
 * @param answers - What each path answers with
 * @param apiUrl - Stripe's API's address, if not its own
 * @returns The gateway, and what it sent
 */
function gateway(answers: Readonly<Record<string, unknown>> = {}, apiUrl?: string) {
  const api = fakeApi(answers);
  const made = stripeGateway({
    secretKey: 'rk_test_key',
    webhookSecret: SECRET,
    taxCode: 'txcd_10103000',
    currency: 'GBP',
    apiUrl,
    fetch: api.fetch,
  });
  return { gateway: made, sent: api.sent };
}

/**
 * An event, signed as Stripe signs them, or not.
 * @param type - Its type
 * @param object - What it is of
 * @param livemode - Whether it is of real payments
 * @returns Its body, and its `Stripe-Signature` header
 */
function signed(type: string, object: Record<string, unknown>, livemode = false) {
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type, livemode, data: { object } });
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}

const SESSION = {
  id: 'cs_1',
  object: 'checkout.session',
  mode: 'payment',
  payment_status: 'paid',
  payment_intent: 'pi_1',
  amount_total: 3600,
  currency: 'gbp',
  metadata: { checkout: 'k1', offer: 'o1' },
};

describe('the Stripe gateway', () => {
  it("makes an offer's Product, with the tax code, and its Price before tax in the gateway's currency", async () => {
    const { gateway: stripe, sent } = gateway({
      'POST /v1/products': { id: 'prod_1', object: 'product' },
      'POST /v1/prices': { id: 'price_1', object: 'price' },
    });
    await expect(stripe.offerPrice({ offerId: 'o1', name: '12 months', amount: 3000 })).resolves.toEqual({
      product: 'prod_1',
      price: 'price_1',
    });
    const [product, price] = sent;
    expect(Object.fromEntries(product?.form ?? [])).toEqual({
      name: '12 months',
      tax_code: 'txcd_10103000',
      'metadata[offer]': 'o1',
    });
    expect(Object.fromEntries(price?.form ?? [])).toEqual({
      product: 'prod_1',
      currency: 'gbp',
      unit_amount: '3000',
      tax_behavior: 'exclusive',
      'metadata[offer]': 'o1',
    });
    // At the API version it is written for, with a restricted key.
    expect(product?.headers.get('stripe-version')).toBe(STRIPE_API_VERSION);
    expect(product?.headers.get('authorization')).toBe('Bearer rk_test_key');
    expect(stripe.currency).toBe('GBP');
  });

  it("archives a retired offer's Price, then its Product", async () => {
    const { gateway: stripe, sent } = gateway({
      'POST /v1/prices/price_1': { id: 'price_1', object: 'price' },
      'POST /v1/products/prod_1': { id: 'prod_1', object: 'product' },
    });
    await stripe.retireOfferPrice({ product: 'prod_1', price: 'price_1' });
    expect(sent.map(({ url, form }) => [new URL(url).pathname, form.get('active')])).toEqual([
      ['/v1/prices/price_1', 'false'],
      ['/v1/products/prod_1', 'false'],
    ]);
  });

  it('starts a Managed Payments checkout of one offer, once, naming the purchase', async () => {
    const { gateway: stripe, sent } = gateway({
      'POST /v1/checkout/sessions': {
        id: 'cs_1',
        object: 'checkout.session',
        url: 'https://checkout.stripe.test/cs_1',
      },
    });
    const input = {
      price: 'price_1',
      checkoutId: 'k1',
      userId: 'u1',
      offerId: 'o1',
      successUrl: 'https://catalogue.test/subscription?checkout=done',
      cancelUrl: 'https://catalogue.test/subscription?checkout=cancelled',
    };
    await expect(stripe.checkout({ ...input, email: 'amber@example.test' })).resolves.toEqual({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    });
    expect(Object.fromEntries(sent[0]?.form ?? [])).toEqual({
      mode: 'payment',
      'line_items[0][price]': 'price_1',
      'line_items[0][quantity]': '1',
      'managed_payments[enabled]': 'true',
      client_reference_id: 'u1',
      'metadata[checkout]': 'k1',
      'metadata[offer]': 'o1',
      customer_email: 'amber@example.test',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    // Without an email address, Stripe's checkout asks for one.
    await stripe.checkout(input);
    expect(sent[1]?.form.has('customer_email')).toBe(false);
  });

  it("reaches a stand-in's address, where one is given", async () => {
    const answers = { 'POST /v1/prices/p': {}, 'POST /v1/products/q': {} };
    const plain = gateway(answers, 'http://127.0.0.1:4175');
    await plain.gateway.retireOfferPrice({ product: 'q', price: 'p' });
    expect(plain.sent[0]?.url).toBe('http://127.0.0.1:4175/v1/prices/p');

    const secure = gateway(answers, 'https://stripe.test');
    await secure.gateway.retireOfferPrice({ product: 'q', price: 'p' });
    expect(secure.sent[0]?.url).toBe('https://stripe.test/v1/prices/p');

    const bare = gateway(answers, 'http://stripe.test');
    await bare.gateway.retireOfferPrice({ product: 'q', price: 'p' });
    expect(bare.sent[0]?.url).toBe('http://stripe.test/v1/prices/p');
  });

  it("reads a paid checkout's event, paid at once or later, by its PaymentIntent, in the mode it came from", () => {
    const { gateway: stripe } = gateway();
    const completed = signed('checkout.session.completed', SESSION);
    expect(stripe.event(completed.payload, completed.signature)).toEqual({
      kind: 'paid',
      checkoutId: 'k1',
      sessionId: 'cs_1',
      paymentIntent: 'pi_1',
      mode: 'test',
      amount: 3600,
      currency: 'GBP',
    });
    const later = signed(
      'checkout.session.async_payment_succeeded',
      { ...SESSION, payment_intent: { id: 'pi_2', object: 'payment_intent' }, amount_total: null, currency: null },
      true,
    );
    expect(stripe.event(later.payload, later.signature)).toMatchObject({
      kind: 'paid',
      paymentIntent: 'pi_2',
      mode: 'live',
    });
  });

  it.each([
    ['checkout.session.completed', { payment_status: 'unpaid' }, 'processing'],
    ['checkout.session.async_payment_failed', {}, 'failed'],
    ['checkout.session.expired', { metadata: null }, 'expired'],
  ])('reads %s as a checkout %s', (type, change, kind) => {
    const { gateway: stripe } = gateway();
    const event = signed(type, { ...SESSION, ...change });
    expect(stripe.event(event.payload, event.signature)).toEqual({
      kind,
      checkoutId: 'metadata' in change ? undefined : 'k1',
      sessionId: 'cs_1',
    });
  });

  it('reads a refund, made by an admin or by Stripe, as what has been refunded of the payment in all', () => {
    const { gateway: stripe } = gateway();
    for (const intent of ['pi_1', { id: 'pi_1', object: 'payment_intent' }]) {
      const event = signed('charge.refunded', {
        id: 'ch_1',
        object: 'charge',
        payment_intent: intent,
        amount: 3600,
        amount_refunded: 1800,
      });
      expect(stripe.event(event.payload, event.signature)).toEqual({
        kind: 'refunded',
        paymentIntent: 'pi_1',
        amount: 3600,
        refunded: 1800,
      });
    }
  });

  it.each([
    ['charge.dispute.created', 'needs_response', 'open'],
    ['charge.dispute.updated', 'under_review', 'open'],
    ['charge.dispute.closed', 'won', 'won'],
    ['charge.dispute.closed', 'warning_closed', 'won'],
    ['charge.dispute.closed', 'lost', 'lost'],
  ])('reads %s, %s, as a dispute %s', (type, status, state) => {
    const { gateway: stripe } = gateway();
    const event = signed(type, { id: 'dp_1', object: 'dispute', payment_intent: 'pi_1', status });
    expect(stripe.event(event.payload, event.signature)).toEqual({ kind: 'dispute', paymentIntent: 'pi_1', state });
  });

  it('ignores a refund or dispute of no PaymentIntent', () => {
    const { gateway: stripe } = gateway();
    for (const [type, object] of [
      ['charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: null, amount: 1, amount_refunded: 1 }],
      ['charge.dispute.created', { id: 'dp_1', object: 'dispute', payment_intent: null, status: 'needs_response' }],
    ] as const) {
      const event = signed(type, object);
      expect(stripe.event(event.payload, event.signature)).toEqual({ kind: 'ignored', type });
    }
  });

  it('ignores what buys nothing here: another mode, a session needing no payment, and other events', () => {
    const { gateway: stripe } = gateway();
    for (const [type, object] of [
      ['checkout.session.completed', { ...SESSION, mode: 'subscription' }],
      ['checkout.session.completed', { ...SESSION, payment_status: 'no_payment_required', payment_intent: null }],
      ['charge.succeeded', { id: 'ch_1', object: 'charge' }],
    ] as const) {
      const event = signed(type, object);
      expect(stripe.event(event.payload, event.signature)).toEqual({ kind: 'ignored', type });
    }
  });

  it("reads no event Stripe did not sign with the endpoint's secret", () => {
    const { gateway: stripe } = gateway();
    const event = signed('checkout.session.completed', SESSION);
    expect(stripe.event(event.payload, null)).toBeUndefined();
    expect(stripe.event(event.payload, 't=1,v1=forged')).toBeUndefined();
    expect(stripe.event(`${event.payload} `, event.signature)).toBeUndefined();
  });
});

describe("Stripe's dashboard", () => {
  it("links a payment in the mode it was made in, a real one's by default", () => {
    expect(stripeDashboardUrl('test', 'pi_1')).toBe('https://dashboard.stripe.com/test/payments/pi_1');
    expect(stripeDashboardUrl('live', 'pi_1')).toBe('https://dashboard.stripe.com/payments/pi_1');
    expect(stripeDashboardUrl(null, 'pi/1')).toBe('https://dashboard.stripe.com/payments/pi%2F1');
  });
});
