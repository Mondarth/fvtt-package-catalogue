import { error } from '@sveltejs/kit';

import { refusalOf } from '#lib/server/accounts/admin-hooks.js';
import { redirectWithCookies } from '#lib/server/accounts/respond.js';

import type { RequestHandler } from './$types';

/**
 * Views the site as the user, for an hour at most (`IMPERSONATION_SECONDS`): the session becomes theirs, the admin's
 * kept aside until they stop (see `/impersonation/stop`). Refused for another admin, and for the admin themselves.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.isAdmin) error(404);
  const response = await locals.auth.api.impersonateUser({
    body: { userId: params.id },
    headers: request.headers,
    asResponse: true,
  });
  if (!response.ok) {
    const { code } = (await response.json().catch(() => ({}))) as { code?: string };
    const refusal = refusalOf(code) ?? 'failed';
    return redirectWithCookies(`/admin/users/${encodeURIComponent(params.id)}?refused=${refusal}`, new Headers());
  }
  return redirectWithCookies('/', response.headers);
};
