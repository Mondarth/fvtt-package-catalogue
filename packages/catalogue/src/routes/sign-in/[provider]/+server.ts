import { error } from '@sveltejs/kit';

import { redirectWithCookies } from '#lib/server/accounts/respond.js';

import type { RequestHandler } from './$types';

/**
 * Starts signing in with a provider, from the sign-in page's form: Better Auth keeps the sign-in's state and gives the
 * provider's address, which the browser is sent to. The provider sends it back to `/auth/callback/<provider>`, and
 * from there to the home page, signed in, or with `?error=` if it was not.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.providers.includes(params.provider)) error(404);
  const response = await locals.auth.api.signInSocial({
    body: { provider: params.provider, callbackURL: '/', errorCallbackURL: '/?error=sign-in' },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = (await response.json()) as { url?: string };
  if (!response.ok || url === undefined) error(502);
  return redirectWithCookies(url, response.headers);
};
