import { error, fail, redirect } from '@sveltejs/kit';

import { parsePrices } from '#lib/prices.js';
import { actorOf } from '#lib/server/accounts/actor.js';
import { dayOf, field, periodOf } from '#lib/server/form.js';
import { isPeriod } from '#lib/server/subscriptions/period.js';

import type { Actions, PageServerLoad } from './$types';

/** The longest an offer's name may be. */
const NAME_MAX = 80;

/**
 * The offers subscriptions are bought by, retired ones too, the newest first; and, where the catalogue offers Patreon,
 * the least pledge that subscribes.
 */
export const load: PageServerLoad = async ({ locals, url }) => ({
  offers: await locals.subscriptions.offers(),
  patreonMinimum: locals.patreon === undefined ? undefined : await locals.patreon.minimum(),
  done: url.searchParams.get('done'),
});

export const actions: Actions = {
  /** Makes an offer, from its name, period, prices and the dates it is on sale between, if given. */
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
    const offer = await locals.subscriptions.createOffer({
      name,
      ...period,
      prices: prices.prices,
      availableFrom: from,
      availableUntil: until,
      createdBy: admin,
    });
    await locals.audit.record({
      actorId: admin,
      action: 'offer.create',
      after: { offer: offer.id, name, ...period, prices: prices.prices },
      requestId: locals.requestId,
    });
    redirect(303, '/admin/subscriptions?done=create');
  },

  /** Retires an offer: it is on sale no longer, and what was bought by it stays as it was. */
  retire: async ({ locals, request }) => {
    const id = field(await request.formData(), 'offer');
    const retired = await locals.subscriptions.retireOffer(id);
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
