import { error } from '@sveltejs/kit';

import { redirectWithCookies } from '#lib/server/accounts/respond.js';

import type { RequestHandler } from './$types';

/**
 * Deletes the signed-in user's profile, from the profile page's form, once its box is ticked: their profile, the
 * providers they sign in with, and every session. Better Auth asks that the session be under a day old; an older one
 * is sent back to the profile page to sign in again.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (locals.user === null) return redirectWithCookies('/', new Headers());
  const form = await request.formData();
  if (form.get('confirm') !== 'yes') return redirectWithCookies('/profile?problem=unconfirmed', new Headers());
  const response = await locals.auth.api.deleteUser({ body: {}, headers: request.headers, asResponse: true });
  if (!response.ok) {
    const { code } = (await response.json()) as { code?: string };
    if (code === 'SESSION_EXPIRED') return redirectWithCookies('/profile?problem=stale', new Headers());
    error(502);
  }
  return redirectWithCookies('/', response.headers);
};
