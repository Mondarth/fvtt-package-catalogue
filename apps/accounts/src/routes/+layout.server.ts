import { dateLocaleOf } from '#lib/dates.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { shownName } from '#lib/server/accounts/nickname.js';

import type { LayoutServerLoad } from './$types';

/**
 * Who is signed in, as every page shows them: by the name they are shown by, and nothing more; whether they are an
 * admin, for the bar's link to the admin pages; and whether an admin is viewing the site as them, for the banner that
 * says so on every page.
 */
export const load: LayoutServerLoad = ({ locals, request }) => ({
  // The regional form of the page's language the reader's browser prefers, which every date is written in.
  dateLocale: dateLocaleOf(request.headers.get('accept-language'), getLocale()),
  signedIn:
    locals.user === null
      ? null
      : {
          name: shownName(locals.user),
          admin: locals.isAdmin,
          impersonated: typeof locals.session?.impersonatedBy === 'string',
        },
});
