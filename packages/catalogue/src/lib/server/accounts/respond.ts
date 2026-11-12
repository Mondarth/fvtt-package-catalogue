/**
 * Answers of the website's sign-in routes, which call Better Auth on the server and pass on what it says.
 */

/**
 * A redirect that sets the cookies another response set, such as Better Auth's.
 *
 * @param location - Where to
 * @param from - The headers whose cookies are set
 * @returns A 303, so that the browser follows it with a GET
 */
export function redirectWithCookies(location: string, from: Headers): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of from.getSetCookie()) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}
