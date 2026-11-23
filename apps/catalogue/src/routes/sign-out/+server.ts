import { redirectWithCookies } from '#lib/server/accounts/respond.js';

import type { RequestHandler } from './$types';

/** Signs out: the session is ended, its cookie cleared, and the browser sent to the home page. */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (locals.session === null) return redirectWithCookies('/', new Headers());
  const response = await locals.auth.api.signOut({ headers: request.headers, asResponse: true });
  return redirectWithCookies('/', response.headers);
};
