/**
 * Where a visitor is sent once signed in: a path of the accounts' own, or a page of another Mondarth application, by an
 * origin the accounts know (`APP_ORIGINS`). Anything else, such as another site, or a path a URL could read as another
 * host, is home.
 */

/**
 * Whether a path is one of the accounts' own, and no more.
 *
 * @param given - The path
 * @returns Whether it is
 */
function isOwnPath(given: string): boolean {
  if (!given.startsWith('/') || given.startsWith('//') || given.startsWith('/\\')) return false;
  // Anything a URL could read as another host, such as a backslash or a control character, is not taken.
  for (let at = 0; at < given.length; at++) {
    const code = given.charCodeAt(at);
    if (code === 0x5c || code < 0x20) return false;
  }
  return true;
}

/**
 * Where to send a visitor once signed in.
 *
 * @param given - Where the form said, if anything
 * @param appOrigins - The other applications' origins, such as `https://catalogue.example.org`
 * @returns A path of the accounts', a URL of another application's, or `/`
 */
export function nextPath(given: unknown, appOrigins: readonly string[] = []): string {
  if (typeof given !== 'string') return '/';
  if (isOwnPath(given)) return given;
  if (!URL.canParse(given)) return '/';
  const url = new URL(given);
  return appOrigins.includes(url.origin) && url.username === '' && url.password === '' ? url.href : '/';
}
