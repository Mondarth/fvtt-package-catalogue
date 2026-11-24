/**
 * Payments: what a payment provider's webhook event does to the purchase it is of. Time is credited once a payment
 * has succeeded, once however often the provider says so, for the period of the offer as it was bought: offers never
 * change once made.
 *
 * Only purchases the catalogue began are acted on: an event of a checkout it has no record of, such as one made from
 * Stripe's dashboard, is logged and left alone.
 */
import type { AccessRecorder } from '../accounts/access.js';
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
  /** Records a disputing buyer's access, from a dispute's opening until none of theirs is open. */
  readonly access?: AccessRecorder | undefined;
}

/** What an event came to: the time credited, or nothing more to do. */
export type Applied = 'credited' | 'taken-back' | 'flagged' | 'duplicate' | 'settled' | 'unknown' | 'ignored';

/**
 * Applies a Stripe event to the purchase it is of.
 *
 * @param event - What the event says
 * @param deps - The stores, and where to log
 * @returns What it came to
 */
export async function applyStripeEvent(event: PaymentEvent, deps: PaymentDeps): Promise<Applied> {
  if (event.kind === 'ignored') return 'ignored';
  if (event.kind === 'refunded' || event.kind === 'dispute') return applyReversal(event, deps);
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

/**
 * Applies a refund, or a dispute, to the credit its payment made. A refund takes back its share of the credit's time,
 * however it was made: by an admin in Stripe's dashboard, or by Stripe itself as the merchant of record. A dispute is
 * flagged while open and cleared once won; one lost counts as a full refund, and stays recorded on the credit as a
 * chargeback.
 *
 * @param event - What the event says
 * @param deps - The stores, and where to log
 * @returns What it came to
 */
async function applyReversal(
  event: Extract<PaymentEvent, { kind: 'refunded' | 'dispute' }>,
  { subscriptions, audit, log, access }: PaymentDeps,
): Promise<Applied> {
  const credit = await subscriptions.creditOf(STRIPE_ACTOR, event.paymentIntent);
  if (credit === undefined) {
    log.warn('Stripe event of a payment the catalogue did not credit', {
      kind: event.kind,
      payment: event.paymentIntent,
    });
    return 'unknown';
  }
  if (event.kind === 'dispute' && event.state !== 'lost') {
    if (credit.disputed === event.state) return 'duplicate';
    await subscriptions.setDisputed(credit.id, event.state);
    // Opened, it starts recording the buyer's access, as evidence; decided, it stops, and what was kept is cleared.
    await (event.state === 'open' ? access?.startRecording(credit.userId) : access?.stopRecording(credit.userId));
    await audit.record({
      actorId: STRIPE_ACTOR,
      action: 'payment.dispute',
      subjectId: credit.userId,
      before: { disputed: credit.disputed },
      after: { paymentIntent: event.paymentIntent, disputed: event.state },
    });
    return 'flagged';
  }

  // What was paid: as the refund says, or, for a dispute lost, as was kept when it was credited.
  const amount = event.kind === 'refunded' ? event.amount : (credit.amountPaid ?? 1);
  const taken = await subscriptions.takeBack({
    creditId: credit.id,
    refunded: event.kind === 'refunded' ? event.refunded : amount,
    amount,
    ...(event.kind === 'dispute' && { disputed: event.state }),
  });
  // The credit was just found, and credits are never deleted but with their user.
  /* v8 ignore next */
  if (taken === undefined) return 'unknown';
  // A dispute lost is decided: recording the buyer's access stops, and what was kept is cleared.
  if (event.kind === 'dispute') await access?.stopRecording(credit.userId);
  if (taken === 'duplicate') return 'duplicate';
  await audit.record({
    actorId: STRIPE_ACTOR,
    action: event.kind === 'refunded' ? 'payment.refund' : 'payment.dispute',
    subjectId: credit.userId,
    before: { paidUntil: taken.before.toISOString(), refunded: credit.refundedAmount },
    after: {
      paymentIntent: event.paymentIntent,
      paidUntil: taken.after.toISOString(),
      days: taken.days,
      ...(event.kind === 'refunded' ? { refunded: event.refunded, amount } : { disputed: 'lost' }),
    },
  });
  return 'taken-back';
}
