import { randomUUID } from 'node:crypto';

import { error, fail, redirect } from '@sveltejs/kit';

import { parsePrices } from '#lib/prices.js';
import { actorOf } from '#lib/server/accounts/actor.js';
import { dayOf, field, periodOf } from '#lib/server/form.js';
import { isPeriod } from '#lib/server/subscriptions/period.js';
import { suggestedRefund } from '#lib/server/subscriptions/refunds.js';
import { stripeDashboardUrl } from '#lib/server/subscriptions/stripe.js';

import type { Actions, PageServerLoad } from './$types';

/** The longest an offer's name may be. */
const NAME_MAX = 80;

/**
 * The offers subscriptions are bought by, retired ones too, the newest first; the currency sold in through Stripe,
 * where the catalogue sells through it; and, where it offers Patreon, the least pledge that subscribes.
 */
export const load: PageServerLoad = async ({ locals, url }) => ({
  offers: await locals.subscriptions.offers(),
  // The refunds asked for, oldest first, each with what to refund now and where to make it.
  refundRequests: (await locals.subscriptions.refundRequests()).map(({ credit, handle }) => ({
    creditId: credit.id,
    userId: credit.userId,
    handle,
    requestedAt: credit.refundRequestedAt,
    purchasedAt: credit.createdAt,
    startsAt: credit.startsAt,
    endsAt: credit.endsAt,
    paid:
      credit.amountPaid === null || credit.currencyPaid === null
        ? null
        : { amount: credit.amountPaid, currency: credit.currencyPaid },
    refunded: credit.refundedAmount,
    reason: credit.refundReason,
    reasonText: credit.refundReasonText,
    suggested: suggestedRefund(credit) ?? null,
    dashboard:
      credit.provider === 'stripe' && credit.externalRef !== null
        ? stripeDashboardUrl(credit.providerAccount, credit.externalRef)
        : null,
  })),
  // The disputes still being decided, the longest open first, each with where to answer it.
  disputes: (await locals.subscriptions.openDisputes()).map(({ credit, handle }) => ({
    creditId: credit.id,
    userId: credit.userId,
    handle,
    openedAt: credit.disputedAt,
    purchasedAt: credit.createdAt,
    startsAt: credit.startsAt,
    endsAt: credit.endsAt,
    paid:
      credit.amountPaid === null || credit.currencyPaid === null
        ? null
        : { amount: credit.amountPaid, currency: credit.currencyPaid },
    dashboard:
      credit.provider === 'stripe' && credit.externalRef !== null
        ? stripeDashboardUrl(credit.providerAccount, credit.externalRef)
        : null,
  })),
  stripeCurrency: locals.stripe?.currency ?? null,
  patreonMinimum: locals.patreon === undefined ? undefined : await locals.patreon.minimum(),
  done: url.searchParams.get('done'),
});

export const actions: Actions = {
  /**
   * Makes an offer, from its name, period, prices and the dates it is on sale between, if given. Where the catalogue
   * sells through Stripe and the offer has a price in its currency, it is made a Stripe Product and Price first, and
   * sold through Stripe: if Stripe cannot make them, no offer is made.
   */
  create: async ({ locals, request }) => {
    const form = await request.formData();
    const name = field(form, 'name');
    const period = periodOf(form);
    const prices = parsePrices(field(form, 'prices'));
    const from = dayOf(field(form, 'from'));
    const until = dayOf(field(form, 'until'));
    const given = { name, months: field(form, 'months'), days: field(form, 'days'), prices: field(form, 'prices') };
    if (name === '' || name.length > NAME_MAX) return fail(400, { ...given, problem: 'name' as const });
    if (!isPeriod(period)) return fail(400, { ...given, problem: 'period' as const });
    if (!prices.ok) return fail(400, { ...given, problem: 'prices' as const, line: prices.line });
    if (from !== null && until !== null && until <= from) return fail(400, { ...given, problem: 'dates' as const });
    const admin = actorOf(locals);
    const id = randomUUID();
    const { stripe } = locals;
    const amount = stripe === undefined ? undefined : prices.prices[stripe.currency];
    let refs;
    if (stripe !== undefined && amount !== undefined) {
      try {
        refs = await stripe.offerPrice({ offerId: id, name, amount });
      } catch (cause) {
        locals.log.error('Stripe could not make the offer', { error: cause });
        return fail(502, { ...given, problem: 'stripe' as const });
      }
    }
    const offer = await locals.subscriptions.createOffer({
      id,
      name,
      ...period,
      prices: prices.prices,
      availableFrom: from,
      availableUntil: until,
      createdBy: admin,
      ...(refs !== undefined && { providers: ['stripe'], providerRefs: { stripe: refs } }),
    });
    await locals.audit.record({
      actorId: admin,
      action: 'offer.create',
      after: { offer: offer.id, name, ...period, prices: prices.prices, providers: offer.providers },
      requestId: locals.requestId,
    });
    redirect(303, '/admin/subscriptions?done=create');
  },

  /**
   * Retires an offer: it is on sale no longer, and what was bought by it stays as it was. Its Stripe Price and Product
   * are archived; if Stripe cannot be reached, it is retired all the same, and can be bought no longer here.
   */
  retire: async ({ locals, request }) => {
    const id = field(await request.formData(), 'offer');
    const retired = await locals.subscriptions.retireOffer(id);
    const refs = retired?.providerRefs.stripe;
    if (refs !== undefined && locals.stripe !== undefined) {
      try {
        await locals.stripe.retireOfferPrice(refs);
      } catch (cause) {
        locals.log.warn('Stripe could not archive a retired offer', { offer: id, error: cause });
      }
    }
    if (retired !== undefined) {
      await locals.audit.record({
        actorId: actorOf(locals),
        action: 'offer.retire',
        before: { offer: id, name: retired.name },
        requestId: locals.requestId,
      });
    }
    redirect(303, '/admin/subscriptions?done=retire');
  },

  /**
   * Sets the least Patreon pledge that subscribes, entered as a price in the campaign's currency, such as `GBP 5.00`;
   * or clears it, and so Patreon subscribes no one. It counts at once, against what Patreon last said of each patron.
   */
  patreonMinimum: async ({ locals, request }) => {
    const { patreon } = locals;
    if (patreon === undefined) error(404);
    const text = field(await request.formData(), 'minimum');
    let minimum: { currency: string; amount: number } | null = null;
    if (text !== '') {
      const read = parsePrices(text);
      const [entry, ...more] = read.ok ? Object.entries(read.prices) : [];
      if (entry === undefined || more.length > 0) return fail(400, { minimum: text, problem: 'minimum' as const });
      minimum = { currency: entry[0], amount: entry[1] };
    }
    const admin = actorOf(locals);
    const before = await patreon.minimum();
    await patreon.setMinimum(minimum, admin);
    await locals.audit.record({
      actorId: admin,
      action: 'patreon.minimum',
      before: { minimum: before },
      after: { minimum },
      requestId: locals.requestId,
    });
    redirect(303, '/admin/subscriptions?done=patreon');
  },
};
