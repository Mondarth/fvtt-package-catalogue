/**
 * Stripe, as the catalogue sells subscription time through it: Stripe Managed Payments, with Stripe (Onelink) the
 * merchant of record, which works out, charges and pays the tax, and sends the receipt and invoice.
 *
 * Each offer sold through Stripe is a Stripe Product, with the tax code its tax is worked out by, and a Price in the one
 * currency the catalogue sells in, before tax. A purchase is a Checkout Session in `payment` mode, one Price once: time
 * is bought outright, never renewed. Stripe says how it went by signed webhook events, read here into the few that
 * matter (see {@link PaymentEvent}).
 *
 * This is the one place the Stripe SDK is used: the rest of the catalogue works through {@link StripeGateway}.
 */
import Stripe from 'stripe';

import type { DisputeState } from './schema.js';

/** The Stripe API version the catalogue is written for: Managed Payments needs `2025-03-31.basil` or later. */
export const STRIPE_API_VERSION = '2026-10-28.endive';

/** An offer, as it is put to Stripe. */
export interface StripeOffer {
  readonly offerId: string;
  /** What it is called, such as `12 months`, which Stripe's checkout and receipt show. */
  readonly name: string;
  /** Its price before tax, in the minor unit of the gateway's currency. */
  readonly amount: number;
}

/** An offer's Product and Price at Stripe. */
export interface StripeRefs {
  readonly product: string;
  readonly price: string;
}

/** A purchase to check out. */
export interface CheckoutInput {
  /** The offer's Price. */
  readonly price: string;
  /** The catalogue's own record of it (`subscription_checkouts`), which the webhook events name. */
  readonly checkoutId: string;
  readonly userId: string;
  readonly offerId: string;
  /** The buyer's email address, which the checkout starts with. */
  readonly email?: string | undefined;
  /** Where Stripe sends the buyer once they have paid; Stripe puts the session's id for `{CHECKOUT_SESSION_ID}`. */
  readonly successUrl: string;
  /** Where Stripe sends the buyer back to if they leave the checkout. */
  readonly cancelUrl: string;
}

/** A refund to make. */
export interface RefundInput {
  readonly paymentIntent: string;
  /** In the minor unit of the payment's currency. */
  readonly amount: number;
  /** The credit it is of, which Stripe keeps with it. */
  readonly creditId: string;
  /** Makes it once: Stripe makes no second refund for the same key. */
  readonly idempotencyKey: string;
}

/** Which of Stripe's modes an event came from: a sandbox's (`test`), or real payments (`live`). */
export type StripeMode = 'test' | 'live';

/**
 * What a Stripe event says of a purchase:
 *
 * - `paid`: the payment succeeded, at once or later, and its time is to be credited, once;
 * - `processing`: the buyer finished the checkout with a payment method that confirms later, such as a bank debit;
 * - `failed`: such a payment failed, and nothing was charged;
 * - `expired`: the buyer left the checkout, which has closed;
 * - `refunded`: some or all of a payment was refunded, by an admin or by Stripe itself, which gives what has been
 *   refunded of it in all so far;
 * - `dispute`: the buyer disputed a payment with their bank: `open` while it is decided, then `won` (by the catalogue,
 *   or an inquiry closed without a chargeback) or `lost` (charged back);
 * - `ignored`: anything else, such as a session of another mode.
 */
export type PaymentEvent =
  | {
      readonly kind: 'paid';
      readonly checkoutId: string | undefined;
      readonly sessionId: string;
      /** The PaymentIntent, Stripe's reference for the payment, which the credit is kept by. */
      readonly paymentIntent: string;
      readonly mode: StripeMode;
      /** What was paid in all, tax included, in the minor unit of `currency`, as Stripe says; none if it does not. */
      readonly amount: number | null;
      /** The currency it was paid in, such as `GBP`; none if Stripe does not say. */
      readonly currency: string | null;
    }
  | {
      readonly kind: 'processing' | 'failed' | 'expired';
      readonly checkoutId: string | undefined;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'refunded';
      readonly paymentIntent: string;
      /** What was paid, in the minor unit of its currency. */
      readonly amount: number;
      /** What has been refunded of it in all so far, in the same unit. */
      readonly refunded: number;
    }
  | { readonly kind: 'dispute'; readonly paymentIntent: string; readonly state: DisputeState }
  | { readonly kind: 'ignored'; readonly type: string };

/** The PaymentIntent a charge or dispute names, as an id or the object. */
const intentOf = (intent: string | { readonly id: string } | null): string | undefined =>
  typeof intent === 'string' ? intent : intent?.id;

/** Stripe, as the catalogue uses it. */
export interface StripeGateway {
  /** The one currency sold in, such as `GBP`. */
  readonly currency: string;
  /** Makes an offer's Product, with the tax code, and its Price before tax. */
  offerPrice(offer: StripeOffer): Promise<StripeRefs>;
  /** Archives an offer's Price and Product, once it is retired: neither can be bought again. */
  retireOfferPrice(refs: StripeRefs): Promise<void>;
  /** Starts a checkout of one offer, for the buyer to pay at the address it gives. */
  checkout(input: CheckoutInput): Promise<{ readonly id: string; readonly url: string }>;
  /**
   * Refunds some of a payment, as its buyer asked: once for a key, however often asked with it, so that asking twice
   * cannot refund twice. Its time is taken back once Stripe's `charge.refunded` event says it is made.
   */
  refund(input: RefundInput): Promise<{ readonly id: string }>;
  /**
   * Reads a webhook event from its raw body and its `Stripe-Signature` header.
   *
   * @returns What it says, or `undefined` if Stripe did not sign it with the webhook's secret
   */
  event(payload: string, signature: string | null): PaymentEvent | undefined;
}

/** How the gateway reaches Stripe. */
export interface StripeGatewayOptions {
  readonly secretKey: string;
  readonly webhookSecret: string;
  /** The tax code put on each offer's Product, such as `txcd_10103000`. */
  readonly taxCode: string;
  /** The one currency sold in, such as `GBP`. */
  readonly currency: string;
  /** Stripe's API's address, for a stand-in; Stripe's own by default. */
  readonly apiUrl?: string | undefined;
  /** What requests are sent with; Stripe's own Node client by default. */
  readonly fetch?: typeof globalThis.fetch | undefined;
}

/** The checkout events the gateway reads, and what each says. */
const CHECKOUT_EVENTS = {
  'checkout.session.async_payment_succeeded': 'paid',
  'checkout.session.async_payment_failed': 'failed',
  'checkout.session.expired': 'expired',
} as const;

/**
 * The gateway, over Stripe's API.
 *
 * @param options - The keys, the tax code and currency, and how to reach Stripe
 * @returns The gateway
 */
export function stripeGateway(options: StripeGatewayOptions): StripeGateway {
  const api = options.apiUrl === undefined ? undefined : new URL(options.apiUrl);
  const stripe = new Stripe(options.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    ...(api !== undefined && {
      host: api.hostname,
      port: api.port === '' ? (api.protocol === 'http:' ? 80 : 443) : Number(api.port),
      protocol: api.protocol === 'http:' ? 'http' : 'https',
    }),
    ...(options.fetch !== undefined && { httpClient: Stripe.createFetchHttpClient(options.fetch) }),
    appInfo: { name: 'fvtt-package-catalogue', url: 'https://mondarth.github.io/fvtt-package-catalogue/' },
  });
  const currency = options.currency.toLowerCase();

  /** What a checkout session event says, by its session. */
  function ofSession(event: Stripe.Event, says: 'paid' | 'processing' | 'failed' | 'expired'): PaymentEvent {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'payment') return { kind: 'ignored', type: event.type };
    const checkoutId = session.metadata?.checkout;
    if (says !== 'paid') return { kind: says, checkoutId, sessionId: session.id };
    const intent = session.payment_intent;
    const paymentIntent = typeof intent === 'string' ? intent : intent?.id;
    // A session paid in full has its PaymentIntent; one that needed no payment has none, and buys nothing here.
    if (paymentIntent === undefined) return { kind: 'ignored', type: event.type };
    return {
      kind: 'paid',
      checkoutId,
      sessionId: session.id,
      paymentIntent,
      mode: event.livemode ? 'live' : 'test',
      amount: session.amount_total,
      currency: session.currency === null ? null : session.currency.toUpperCase(),
    };
  }

  return {
    currency: options.currency,

    async offerPrice({ offerId, name, amount }) {
      const product = await stripe.products.create({
        name,
        tax_code: options.taxCode,
        metadata: { offer: offerId },
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency,
        unit_amount: amount,
        tax_behavior: 'exclusive',
        metadata: { offer: offerId },
      });
      return { product: product.id, price: price.id };
    },

    async retireOfferPrice({ product, price }) {
      await stripe.prices.update(price, { active: false });
      await stripe.products.update(product, { active: false });
    },

    async checkout(input) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: input.price, quantity: 1 }],
        managed_payments: { enabled: true },
        client_reference_id: input.userId,
        metadata: { checkout: input.checkoutId, offer: input.offerId },
        ...(input.email !== undefined && { customer_email: input.email }),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      // A session in a mode with a hosted page always has its address.
      /* v8 ignore next */
      if (session.url === null) throw new Error('Stripe gave the checkout no address');
      return { id: session.id, url: session.url };
    },

    async refund({ paymentIntent, amount, creditId, idempotencyKey }) {
      const made = await stripe.refunds.create(
        { payment_intent: paymentIntent, amount, reason: 'requested_by_customer', metadata: { credit: creditId } },
        { idempotencyKey },
      );
      return { id: made.id };
    },

    event(payload, signature) {
      if (signature === null) return undefined;
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(payload, signature, options.webhookSecret);
      } catch {
        return undefined;
      }
      if (event.type === 'checkout.session.completed') {
        const { payment_status: status } = event.data.object;
        return ofSession(event, status === 'unpaid' ? 'processing' : 'paid');
      }
      if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        const paymentIntent = intentOf(charge.payment_intent);
        if (paymentIntent === undefined) return { kind: 'ignored', type: event.type };
        return { kind: 'refunded', paymentIntent, amount: charge.amount, refunded: charge.amount_refunded };
      }
      if (
        event.type === 'charge.dispute.created' ||
        event.type === 'charge.dispute.updated' ||
        event.type === 'charge.dispute.closed'
      ) {
        const dispute = event.data.object;
        const paymentIntent = intentOf(dispute.payment_intent);
        if (paymentIntent === undefined) return { kind: 'ignored', type: event.type };
        // An inquiry closed without a chargeback (`warning_closed`) is as good as a dispute won.
        const state: DisputeState =
          dispute.status === 'lost'
            ? 'lost'
            : dispute.status === 'won' || dispute.status === 'warning_closed'
              ? 'won'
              : 'open';
        return { kind: 'dispute', paymentIntent, state };
      }
      const says = (CHECKOUT_EVENTS as Partial<Record<string, 'paid' | 'failed' | 'expired'>>)[event.type];
      return says === undefined ? { kind: 'ignored', type: event.type } : ofSession(event, says);
    },
  };
}

/**
 * Where a payment is in Stripe's dashboard, which keeps its invoice and receipt: the catalogue keeps none.
 *
 * @param mode - The mode it was made in; `live` when not known
 * @param paymentIntent - Its PaymentIntent
 * @returns The page's address
 */
export function stripeDashboardUrl(mode: string | null, paymentIntent: string): string {
  return `https://dashboard.stripe.com/${mode === 'test' ? 'test/' : ''}payments/${encodeURIComponent(paymentIntent)}`;
}
