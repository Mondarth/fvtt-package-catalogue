import { error, redirect } from '@sveltejs/kit';

import { redirectWithCookies } from '#lib/server/accounts/respond.js';
import { PATREON } from '#lib/server/subscriptions/patreon.js';

import type { RequestHandler } from './$types';

/**
 * Links the user's Patreon, from the subscription page's form: Better Auth keeps the link's state in a cookie and gives
 * Patreon's address, which the browser is sent to; Patreon sends it back to the subscription page, with
 * `?patreon=linked`, or `?error=` if it was not linked. One Patreon account is one user's alone: Better Auth refuses
 * another's. A route of its own, not a form action, as it passes on Better Auth's cookies with the redirect.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (locals.user === null) redirect(303, '/');
  if (locals.patreon === undefined) error(404);
  const response = await locals.auth.api.linkSocialAccount({
    body: { provider: PATREON, callbackURL: '/subscription?patreon=linked', errorCallbackURL: '/subscription' },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = (await response.json().catch(() => ({}))) as { url?: string };
  if (!response.ok || url === undefined)
    redirect(303, `/subscription?error=${response.status === 403 ? 'refused' : 'failed'}`);
  return redirectWithCookies(url, response.headers);
};
