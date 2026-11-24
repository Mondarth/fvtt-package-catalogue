import { defineConfig } from '@inlang/paraglide-js';

/**
 * How the website's messages are compiled, read by both the Vite plugin and `paraglide-js compile`.
 *
 * The locale is the visitor's choice (the cookie the language picker sets), else the browser's preferred language,
 * else English. URLs are not localised: the API's paths must stay as they are, and never reach the i18n middleware.
 */
export default defineConfig({
  outdir: './src/lib/paraglide',
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
  routeStrategies: [
    { match: '/api/:path(.*)?', exclude: true },
    { match: '/healthz', exclude: true },
  ],
  emitTsDeclarations: true,
});
