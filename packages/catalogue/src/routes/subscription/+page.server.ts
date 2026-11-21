import { error, fail, redirect } from '@sveltejs/kit';

import type { Actions, PageServerLoad } from './$types';

/** What a Patreon link that failed came back saying, as Better Auth names it, or the link route did. */
const LINK_ERRORS: Readonly<Record<string, 'taken' | 'failed' | 'refused'>> = {
  account_already_linked_to_different_user: 'taken',
  refused: 'refused',
};

/**
 * The user's subscription: until when, the time that made it (dates, where it came from and its period, but not an
 * admin's notes), the offers on sale, and their Patreon, where the catalogue offers it: linked or not, what Patreon
 * last said, and the least pledge that subscribes. The sign-in page for anyone else.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { user, patreon } = locals;
  if (user === null) redirect(303, '/');
  const [entitlement, history, offers, patreonStatus, minimum] = await Promise.all([
    locals.entitlement(),
    locals.subscriptions.history(user.id),
    locals.subscriptions.activeOffers(),
    patreon?.status(user.id),
    patreon?.minimum(),
  ]);
  const linkError = url.searchParams.get('error');
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
