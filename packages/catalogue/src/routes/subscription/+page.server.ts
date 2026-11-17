import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/**
 * The user's subscription: until when, the time that made it (dates, where it came from and its period, but not an
 * admin's notes), and the offers on sale. The sign-in page for anyone else.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const { user } = locals;
  if (user === null) redirect(303, '/');
  const [entitlement, history, offers] = await Promise.all([
    locals.entitlement(),
    locals.subscriptions.history(user.id),
    locals.subscriptions.activeOffers(),
  ]);
  return {
    entitlement,
    admin: locals.isAdmin,
    history: history.map(({ id, source, startsAt, endsAt, months, days }) => ({
      id,
      source,
      startsAt,
      endsAt,
      months,
      days,
    })),
    offers: offers.map(({ id, name, months, days, prices }) => ({ id, name, months, days, prices })),
  };
};
