import { error } from '@sveltejs/kit';

import { redirectWithCookies } from '#lib/server/accounts/respond.js';
import { deletionBlockOf } from '#lib/server/subscriptions/deletion.js';

import type { RequestHandler } from './$types';

/**
 * Deletes the signed-in user's profile, from the profile page's form, once its box is ticked: their profile, the
 * providers they sign in with, and every session. Better Auth asks that the session be under a day old; an older one
 * is sent back to the profile page to sign in again.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (locals.user === null) return redirectWithCookies('/', new Headers());
  // An admin viewing the site as the user may not delete their profile; Better Auth's hooks refuse it too.
  if (typeof locals.session?.impersonatedBy === 'string') {
    return redirectWithCookies('/profile?problem=impersonating', new Headers());
  }
  // Not while a refund asked for is still to be made, nor while a payment is disputed (Terms, Sec. B.III.4).
  const blocked = deletionBlockOf(await locals.subscriptions.history(locals.user.id));
  if (blocked !== null) return redirectWithCookies(`/profile?problem=${blocked}`, new Headers());
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
