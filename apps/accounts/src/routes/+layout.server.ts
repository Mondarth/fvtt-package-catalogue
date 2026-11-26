import { dateLocaleOf } from '#lib/dates.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { returnFrom } from '#lib/server/accounts/return-to.js';
import { shownName } from '#lib/server/accounts/nickname.js';

import type { ReturnTo } from '#lib/server/accounts/return-to.js';
import type { LayoutServerLoad } from './$types';

/**
 * Who is signed in, as every page shows them: by the name they are shown by, and nothing more; whether they are an
 * admin, for the bar's link to the admin pages; and whether an admin is viewing the site as them, for the banner that
 * says so on every page.
 *
 * And the way back to another Mondarth application, for a visitor who came from one: the page's own address says it
 * first (`?next=` and `?from=`), so that each tab goes back to where it came from; it is kept with the session, for
 * the pages they go on to, such as a checkout's, which say nothing of it; and offered until they go back, or a few
 * hours pass.
 */
export const load: LayoutServerLoad = async ({ locals, request, url }) => {
  const given = returnFrom(url, locals.appOrigins);
  const session = locals.session ?? null;
  let returnTo: ReturnTo | undefined = given;
  if (session !== null) {
    if (given === undefined) returnTo = await locals.accounts.returnOf(session.id);
    else await locals.accounts.setReturn(session.id, given);
  }
  return {
    // The regional form of the page's language the reader's browser prefers, which every date is written in.
    dateLocale: dateLocaleOf(request.headers.get('accept-language'), getLocale()),
    signedIn:
      locals.user === null
        ? null
        : {
            name: shownName(locals.user),
            admin: locals.isAdmin,
            impersonated: typeof session?.impersonatedBy === 'string',
          },
    returnTo: returnTo ?? null,
  };
};
