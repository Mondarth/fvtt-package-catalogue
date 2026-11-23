/**
 * Who is acting, for what the admin pages record as theirs. The admin pages are for admins alone, so someone is always
 * signed in there; anyone else is answered as the pages are, as if there were nothing there.
 */
import { error } from '@sveltejs/kit';

/**
 * The id of the user acting.
 *
 * @param locals - The request's locals
 * @returns Their id
 * @throws {HttpError} 404, if no one is signed in
 */
export function actorOf(locals: Pick<App.Locals, 'user'>): string {
  if (locals.user === null) error(404);
  return locals.user.id;
}
