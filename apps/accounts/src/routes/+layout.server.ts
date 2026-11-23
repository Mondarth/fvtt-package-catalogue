import { dateLocaleOf } from '@mondarth/ui/dates';
import { getLocale } from '#lib/paraglide/runtime.js';

import type { LayoutServerLoad } from './$types';

/** What every page is given: the regional form of the page's language the reader's browser prefers, for dates. */
export const load: LayoutServerLoad = ({ request }) => ({
  dateLocale: dateLocaleOf(request.headers.get('accept-language'), getLocale()),
});
