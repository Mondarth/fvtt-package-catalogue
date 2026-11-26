/**
 * Going back to another Mondarth application: to the page the link names (`?to=`), checked as a sign-in's `next` is,
 * or else home; the way back kept with the session is forgotten, as it has been taken.
 */
import { returnPage } from '#lib/server/accounts/return-to.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  const page = returnPage(url.searchParams.get('to'), locals.appOrigins);
  if (locals.session !== null) await locals.accounts.clearReturn(locals.session.id);
  return new Response(null, { status: 303, headers: { location: page ?? '/' } });
};
