import { signedInBy } from '#lib/server/signed-in.js';

import type { LayoutServerLoad } from './$types';

/** What every page is given: who is signed in, as the accounts tell it, and where the accounts are, which it links to. */
export const load: LayoutServerLoad = async ({ locals, request }) => ({
  signedIn: await signedInBy(locals.accounts, request.headers.get('cookie'), locals.log),
  accountsSite: locals.accountsSite ?? '',
});
