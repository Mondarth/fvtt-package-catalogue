/**
 * Payments: what a payment provider's webhook event does to the purchase it is of. Time is credited once a payment
 * has succeeded, once however often the provider says so, for the period of the offer as it was bought: offers never
 * change once made.
 *
 * Only purchases the catalogue began are acted on: an event of a checkout it has no record of, such as one made from
 * Stripe's dashboard, is logged and left alone.
 */
import type { AuditStore } from '../accounts/audit.js';
import type { Logger } from '../log.js';
import type { PaymentEvent } from './stripe.js';
import type { SubscriptionStore } from './store.js';

/** Who the audit log names for what a payment provider did. */
export const STRIPE_ACTOR = 'stripe';

/** What applying an event needs. */
export interface PaymentDeps {
  readonly subscriptions: SubscriptionStore;
  readonly audit: AuditStore;
  readonly log: Logger;
}

/** What an event came to: the time credited, or nothing more to do. */
export type Applied = 'credited' | 'duplicate' | 'settled' | 'unknown' | 'ignored';

/**
 * Applies a Stripe event to the purchase it is of.
 *
 * @param event - What the event says
 * @param deps - The stores, and where to log
 * @returns What it came to
 */
export async function applyStripeEvent(event: PaymentEvent, deps: PaymentDeps): Promise<Applied> {
  if (event.kind === 'ignored') return 'ignored';
  const { subscriptions, audit, log } = deps;
  const checkout = await subscriptions.checkoutOf(STRIPE_ACTOR, event.checkoutId, event.sessionId);
  if (checkout === undefined) {
    log.warn('Stripe event of a checkout the catalogue did not begin', { kind: event.kind, session: event.sessionId });
    return 'unknown';
  }
  if (event.kind !== 'paid') {
    await subscriptions.settleCheckout(checkout.id, event.kind);
    return 'settled';
  }

  // The offer it bought, whose period it bought: an offer is never deleted while a checkout names it.
  const offer = await subscriptions.offer(checkout.offerId);
  /* v8 ignore next */
  if (offer === undefined) throw new Error(`The checkout ${checkout.id} names no offer`);
  const made = await subscriptions.credit({
    userId: checkout.userId,
    source: 'payment',
    provider: STRIPE_ACTOR,
    externalRef: event.paymentIntent,
    providerAccount: event.mode,
    offerId: offer.id,
    amountPaid: event.amount,
    currencyPaid: event.currency,
    months: offer.months,
    days: offer.days,
  });
  const credit = made === 'duplicate' ? await subscriptions.creditOf(STRIPE_ACTOR, event.paymentIntent) : made;
  await subscriptions.settleCheckout(checkout.id, 'paid', credit?.id);
  if (made === 'duplicate') return 'duplicate';
  await audit.record({
    actorId: STRIPE_ACTOR,
    action: 'payment.credit',
    subjectId: checkout.userId,
    after: {
      offer: offer.id,
      name: offer.name,
      paymentIntent: event.paymentIntent,
      mode: event.mode,
      amount: event.amount,
      currency: event.currency,
      startsAt: made.startsAt.toISOString(),
      endsAt: made.endsAt.toISOString(),
    },
  });
  return 'credited';
}
