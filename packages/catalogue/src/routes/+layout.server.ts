import { shownName } from '#lib/server/accounts/nickname.js';

import type { LayoutServerLoad } from './$types';

/** Who is signed in, as every page shows them: by the name they are shown by, and nothing more. */
export const load: LayoutServerLoad = ({ locals }) => ({
  signedIn: locals.user === null ? null : { name: shownName(locals.user) },
});
