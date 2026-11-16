import { redirectWithCookies } from '#lib/server/accounts/respond.js';

import type { RequestHandler } from './$types';

/**
 * Stops viewing the site as someone: the admin's own session is theirs again, and they are taken back to the user's
 * admin page. Anyone not viewing the site as someone is taken home.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  const viewed = typeof locals.session?.impersonatedBy === 'string' ? locals.user?.id : undefined;
  if (viewed === undefined) return redirectWithCookies('/', new Headers());
  const response = await locals.auth.api.stopImpersonating({ headers: request.headers, asResponse: true });
  return redirectWithCookies(response.ok ? `/admin/users/${encodeURIComponent(viewed)}` : '/', response.headers);
};
