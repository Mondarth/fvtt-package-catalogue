/**
 * Where a sign-in comes back to: a page of this site, given by the page that asked, such as `/device?user_code=…`. Only
 * a path of this site is taken, so that a link cannot send someone signing in on to another.
 */

/**
 * A path to come back to after signing in, if it is one of this site's.
 *
 * @param given - What the page gave
 * @returns The path, or `/` for anything else
 */
export function nextPath(given: unknown): string {
  if (typeof given !== 'string' || !given.startsWith('/') || given.startsWith('//') || given.startsWith('/\\')) {
    return '/';
  }
  // Anything a URL could read as another host, such as a backslash or a control character, is not taken.
  for (let at = 0; at < given.length; at++) {
    const code = given.charCodeAt(at);
    if (code === 0x5c || code < 0x20) return '/';
  }
  return given;
}
