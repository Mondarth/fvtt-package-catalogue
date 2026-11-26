/**
 * Signs out of every Mondarth website, from the catalogue: the accounts end the session its cookie names, through
 * their internal API, and give the headers that clear the cookie, shared by every Mondarth subdomain, which this
 * response sends. A form at the catalogue cannot post to the accounts' own sign-out: that would be a cross-site post,
 * which the accounts refuse.
 *
 * Should the accounts not answer, the visitor is sent home still signed in, and the failure logged.
 */
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  const headers = new Headers({ location: '/' });
  const cookie = request.headers.get('cookie');
  if (locals.accounts !== undefined && cookie !== null && cookie !== '') {
    try {
      for (const cleared of await locals.accounts.signOut(cookie)) headers.append('set-cookie', cleared);
    } catch (error) {
      locals.log.warn('The accounts could not sign out', { error });
    }
  }
  return new Response(null, { status: 303, headers });
};
