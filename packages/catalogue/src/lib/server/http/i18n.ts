/**
 * The website's localisation: each page is rendered in the visitor's locale (see project.inlang/paraglide.config.ts),
 * with its `<html lang dir>` set to match. The API and the health check are passed through untouched.
 */
import type { Handle } from '@sveltejs/kit/hooks';

import { getTextDirection } from '../../paraglide/runtime.js';
import { paraglideMiddleware } from '../../paraglide/server.js';
import { isSitePath } from './paths.js';

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
