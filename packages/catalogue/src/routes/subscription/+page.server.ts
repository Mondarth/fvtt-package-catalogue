import { error, fail, redirect } from '@sveltejs/kit';

import { field } from '#lib/server/form.js';
import { suggestedRefund, withinCancellation } from '#lib/server/subscriptions/refunds.js';

import { REFUND_REASONS, REFUND_REASON_MAX } from '#lib/refund-reasons.js';

import type { Entitlement } from '#lib/server/subscriptions/entitlement.js';
import type { Credit, GivenReason } from '#lib/server/subscriptions/store.js';
import type { Actions, PageServerLoad } from './$types';

/** What a Patreon link that failed came back saying, as Better Auth names it, or the link route did. */
const LINK_ERRORS: Readonly<Record<string, 'taken' | 'failed' | 'refused'>> = {
  account_already_linked_to_different_user: 'taken',
  refused: 'refused',
};

/**
 * How a credit stands with refunds, for its buyer: `refunded` in full, for all its time not yet used, or charged back;
 * `partly` refunded; `requested`,
 * a refund asked for and not yet made; `refundable`, paid for and not refunded, which a refund may be asked for; or
 * none, for time granted or given by Patreon.
 *
 * @param credit - The credit
 * @returns How it stands
 */
function refundOf(credit: Credit): 'refunded' | 'partly' | 'requested' | 'refundable' | null {
  if (credit.source !== 'payment' || credit.amountPaid === null) return null;
  if (credit.refundedAmount >= credit.amountPaid || credit.disputed === 'lost') return 'refunded';
  // Refunded for all its time not yet used: nothing more is owed, though what was used was kept.
  if (credit.refundedAmount > 0 && suggestedRefund(credit)?.amount === 0) return 'refunded';
  const asked =
    credit.refundRequestedAt !== null && (credit.refundedAt === null || credit.refundedAt < credit.refundRequestedAt);
  if (asked) return 'requested';
  return credit.refundedAmount > 0 ? 'partly' : 'refundable';
}

/**
 * Refunds a purchase cancelled within 14 days of buying it at once, through Stripe, for the time not yet used. A key
 * made of the purchase and when the refund was asked for makes it once, however often it is asked.
 *
 * @param locals - The request's, with Stripe and where to log
 * @param credit - The purchase's credit, its refund just asked for
 * @returns What was refunded, or `undefined` for one an admin is to make: one Stripe did not take, older than 14 days,
 *   with nothing owed, or that Stripe could not refund now
 */
async function refundAtOnce(locals: App.Locals, credit: Credit): Promise<number | undefined> {
  const { stripe } = locals;
  if (
    stripe === undefined ||
    credit.provider !== 'stripe' ||
    credit.externalRef === null ||
    credit.refundRequestedAt === null ||
    !withinCancellation(credit)
  ) {
    return undefined;
  }
  const owed = suggestedRefund(credit)?.amount ?? 0;
  if (owed <= 0) return undefined;
  try {
    await stripe.refund({
      paymentIntent: credit.externalRef,
      amount: owed,
      creditId: credit.id,
      idempotencyKey: `refund-${credit.id}-${credit.refundRequestedAt.toISOString()}`,
    });
    return owed;
  } catch (cause) {
    locals.log.warn('Stripe could not refund a cancellation: an admin is to make it', {
      credit: credit.id,
      error: cause,
    });
    return undefined;
  }
}

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What cancelling a purchase would do, for its buyer to see before confirming: the refund, pro rata, and how its days
 * are counted; whether it is made at once, within 14 days of buying it through Stripe, or by an admin; and whether it
 * would end their subscription, leaving no time on their account and no Patreon pledge that subscribes them.
 *
 * @param credit - The purchase's credit
 * @param entitlement - Whether, and until when, the buyer is subscribed
 * @param admin - Whether they are an admin, who loses nothing
 * @param stripe - Whether Stripe refunds at once
 * @returns What it would do, or none for a purchase whose refund cannot be asked for
 */
function previewOf(credit: Credit, entitlement: Entitlement, admin: boolean, stripe: boolean) {
  const refund = refundOf(credit);
  const owed = suggestedRefund(credit);
  if ((refund !== 'refundable' && refund !== 'partly') || owed === undefined || credit.currencyPaid === null)
    return null;
  const now = Date.now();
  // What would remain beyond the time of this purchase not yet used: none but what of it is used, if nothing else is.
  const from = Math.max(now, credit.startsAt.getTime());
  const unused = Math.max(0, credit.startsAt.getTime() + owed.of * DAY_MS - from);
  const left = entitlement.paidUntil === null ? now : entitlement.paidUntil.getTime() - unused;
  return {
    ...owed,
    paid: credit.amountPaid,
    currency: credit.currencyPaid,
    countedFrom: new Date(from),
    atOnce: stripe && credit.provider === 'stripe' && withinCancellation(credit),
    endsSubscription: !admin && !entitlement.patreon && left <= now,
  };
}

/** How a refund asked for can come back. */
const REFUND_DONE = ['requested', 'refunded'] as const;

/** Whether the signed-in session is an admin's, viewing the site as the user: nothing is bought then. */
const impersonating = (locals: App.Locals) => typeof locals.session?.impersonatedBy === 'string';

/**
 * The user's subscription: until when, the time that made it (dates, where it came from and its period, but not an
 * admin's notes), the offers on sale, each to be bought through Stripe where it is sold there, any purchase still
 * being paid for, and their Patreon, where the catalogue offers it: linked or not, what Patreon last said, and the
 * least pledge that subscribes. The sign-in page for anyone else.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { user, patreon, stripe } = locals;
  if (user === null) redirect(303, '/');
  const [entitlement, history, offers, processing, patreonStatus, minimum] = await Promise.all([
    locals.entitlement(),
    locals.subscriptions.history(user.id),
    locals.subscriptions.activeOffers(),
    locals.subscriptions.processingCheckouts(user.id),
    patreon?.status(user.id),
    patreon?.minimum(),
  ]);
  const linkError = url.searchParams.get('error');
  return {
    entitlement,
    admin: locals.isAdmin,
    history: history.map(credit => ({
      id: credit.id,
      source: credit.source,
      startsAt: credit.startsAt,
      endsAt: credit.endsAt,
      months: credit.months,
      days: credit.days,
      // When it was bought or granted, and what was paid for it, tax included, where it was paid for.
      purchasedAt: credit.createdAt,
      paid:
        credit.amountPaid === null || credit.currencyPaid === null
          ? null
          : { amount: credit.amountPaid, currency: credit.currencyPaid },
      refund: refundOf(credit),
      // What cancelling it would refund, and what it would end, for the buyer to confirm first.
      preview: previewOf(credit, entitlement, locals.isAdmin, stripe !== undefined),
    })),
    offers: offers.map(({ id, name, months, days, prices, providerRefs }) => {
      // Its price before tax, where it is sold through Stripe.
      const amount = stripe === undefined || providerRefs.stripe === undefined ? undefined : prices[stripe.currency];
      return {
        id,
        name,
        months,
        days,
        prices,
        stripePrice: stripe === undefined || amount === undefined ? null : { currency: stripe.currency, amount },
      };
    }),
    canBuy: stripe !== undefined && !impersonating(locals),
    processing: processing.length,
    checkout: url.searchParams.get('checkout'),
    patreon:
      patreonStatus === undefined
        ? null
        : {
            linked: patreonStatus.linked,
            subscribed: patreonStatus.subscribed,
            minimum: minimum ?? null,
            membership:
              patreonStatus.membership === null
                ? null
                : {
                    patronStatus: patreonStatus.membership.patronStatus,
                    amount: patreonStatus.membership.amount,
                    nextChargeAt: patreonStatus.membership.nextChargeAt,
                    checkedAt: patreonStatus.membership.checkedAt,
                    failure: patreonStatus.membership.failure,
                  },
          },
    patreonDone: url.searchParams.get('patreon'),
    // How the refund just asked for came back: made at once, within 14 days of buying, or asked of an admin.
    refundDone: REFUND_DONE.find(done => done === url.searchParams.get('refund')) ?? null,
    patreonError: linkError === null ? null : (LINK_ERRORS[linkError] ?? 'failed'),
  };
};

export const actions: Actions = {
  /**
   * Buys an offer through Stripe: once the user has asked for their time to start at once and agreed to the terms of
   * sale, a checkout is begun, recording when, and they are sent to Stripe's checkout page to pay. Stripe's webhook
   * credits the time once the payment succeeds (see `routes/webhooks/stripe`).
   */
  buy: async ({ locals, request, url }) => {
    const { user, stripe } = locals;
    if (user === null) redirect(303, '/');
    if (stripe === undefined) error(404);
    if (impersonating(locals)) return fail(403, { buy: 'impersonating' as const });
    const form = await request.formData();
    const offerId = field(form, 'offer');
    if (form.get('consent') !== 'on') return fail(400, { buy: 'consent' as const, offer: offerId });
    const offer = (await locals.subscriptions.activeOffers()).find(({ id }) => id === offerId);
    const refs = offer?.providerRefs.stripe;
    if (offer === undefined || refs === undefined) return fail(400, { buy: 'offer' as const });
    const checkout = await locals.subscriptions.openCheckout({
      userId: user.id,
      offerId,
      provider: 'stripe',
      consentedAt: new Date(),
    });
    let session;
    try {
      session = await stripe.checkout({
        price: refs.price,
        checkoutId: checkout.id,
        userId: user.id,
        offerId,
        email: user.email,
        successUrl: `${url.origin}/subscription?checkout=done`,
        cancelUrl: `${url.origin}/subscription?checkout=cancelled`,
      });
    } catch (cause) {
      locals.log.error('Stripe could not start a checkout', { error: cause });
      await locals.subscriptions.settleCheckout(checkout.id, 'failed');
      return fail(502, { buy: 'stripe' as const });
    }
    await locals.subscriptions.attachSession(checkout.id, session.id);
    // Stripe's own checkout page, at the address Stripe gave for this checkout.
    redirect(303, session.url, { external: true });
  },

  /**
   * Cancels a purchase and asks for its refund, as the terms of sale allow at any time: the time not yet used is
   * refunded, counted from when the purchase's time starts. The request is recorded, and confirmed on the page at once;
   * asking again changes nothing. Within 14 days of buying it, Stripe is asked to refund it at once, with no admin to
   * make it; later, or if Stripe cannot, an admin makes it from the admin pages.
   */
  refund: async ({ locals, request }) => {
    const { user } = locals;
    if (user === null) redirect(303, '/');
    if (impersonating(locals)) return fail(403, { refund: 'impersonating' as const });
    const form = await request.formData();
    // Asked only once the buyer has seen what it refunds, and what it ends, and confirmed it.
    if (form.get('confirmed') !== 'yes') return fail(400, { refund: 'unconfirmed' as const });
    const creditId = field(form, 'credit');
    // Why, where an admin is to make it: a reason chosen, and for `other` the buyer's own words.
    const chosen = field(form, 'reason');
    const words = field(form, 'reason_text');
    let reason: GivenReason | undefined;
    if (chosen !== '') {
      const known = REFUND_REASONS.find(given => given === chosen);
      if (known === undefined) return fail(400, { refund: 'reason' as const, credit: creditId });
      if (known === 'other' && (words === '' || words.length > REFUND_REASON_MAX)) {
        return fail(400, { refund: 'reason' as const, credit: creditId });
      }
      reason = { reason: known, ...(known === 'other' && { text: words }) };
    }
    const asked = await locals.subscriptions.requestRefund(user.id, creditId, reason);
    if (asked === undefined) return fail(400, { refund: 'credit' as const });
    const refunded = await refundAtOnce(locals, asked);
    await locals.audit.record({
      actorId: user.id,
      action: 'refund.request',
      subjectId: user.id,
      after: {
        credit: asked.id,
        paymentIntent: asked.externalRef,
        refundedAtOnce: refunded ?? null,
        reason: reason?.reason ?? null,
      },
      requestId: locals.requestId,
    });
    redirect(303, `/subscription?refund=${refunded === undefined ? 'requested' : 'refunded'}`);
  },

  /** Unlinks the user's Patreon, unless it is how they sign in alone, which Better Auth refuses. */
  unlink: async ({ locals, request }) => {
    if (locals.user === null) redirect(303, '/');
    if (locals.patreon === undefined) error(404);
    const accountId = await locals.patreon.accountOf(locals.user.id);
    if (accountId === undefined) redirect(303, '/subscription');
    const response = await locals.auth.api.unlinkAccount({
      body: { accountId },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) return fail(response.status, { patreon: response.status === 400 ? 'only' : 'refused' });
    redirect(303, '/subscription?patreon=unlinked');
  },

  /** Asks Patreon again now, whatever was kept: for a patron who has just pledged. */
  check: async ({ locals }) => {
    if (locals.user === null) redirect(303, '/');
    if (locals.patreon === undefined) error(404);
    await locals.patreon.status(locals.user.id, { force: true });
    redirect(303, '/subscription?patreon=checked');
  },
};
