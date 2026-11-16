import { error } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

/**
 * The admin pages, for admins alone: anyone else, signed in or not, is answered as if there were none here, so that
 * they are not told the pages exist.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.isAdmin) error(404);
  return {};
};
