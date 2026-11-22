import { error, fail, redirect } from '@sveltejs/kit';

import { field } from '#lib/server/form.js';

import type { Actions, PageServerLoad } from './$types';

/** What a Patreon link that failed came back saying, as Better Auth names it, or the link route did. */
const LINK_ERRORS: Readonly<Record<string, 'taken' | 'failed' | 'refused'>> = {
  account_already_linked_to_different_user: 'taken',
  refused: 'refused',
};

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
    history: history.map(({ id, source, startsAt, endsAt, months, days, createdAt, amountPaid, currencyPaid }) => ({
      id,
      source,
      startsAt,
      endsAt,
      months,
      days,
      // When it was bought or granted, and what was paid for it, tax included, where it was paid for.
      purchasedAt: createdAt,
      paid: amountPaid === null || currencyPaid === null ? null : { amount: amountPaid, currency: currencyPaid },
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
