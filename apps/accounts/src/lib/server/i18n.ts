/**
 * The website's localisation: each page is rendered in the visitor's locale (see project.inlang/paraglide.config.ts),
 * with its `<html lang dir>` set to match. The internal API and the health check are no page, and are passed through
 * untouched.
 */
import type { Handle } from '@sveltejs/kit/hooks';

import { getTextDirection } from '../paraglide/runtime.js';
import { paraglideMiddleware } from '../paraglide/server.js';

/**
 * Whether a path is one of the website's pages, rather than the internal API's or the health check.
 *
 * @param pathname - The request's path
 * @returns Whether it is
 */
export function isSitePath(pathname: string): boolean {
  return pathname !== '/healthz' && pathname !== '/internal' && !pathname.startsWith('/internal/');
}

/** The `handle` hook that localises the website. */
export const handleI18n: Handle = ({ event, resolve }) => {
  if (!isSitePath(event.url.pathname)) return resolve(event);
  return paraglideMiddleware(event.request, ({ request, locale }) =>
    resolve(
      { ...event, request },
      {
        transformPageChunk: ({ html }) =>
          html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale)),
      },
    ),
  );
};
