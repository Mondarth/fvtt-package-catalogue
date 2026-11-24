/**
 * Paraglide's configuration for the accounts' website: its messages compile into src/lib/paraglide. A page is in the
 * locale the visitor picked (the cookie), or else the one their browser prefers, or else English. The internal API
 * and the health check are no page, and are left alone.
 */
import { defineConfig } from '@inlang/paraglide-js';

export default defineConfig({
  outdir: './src/lib/paraglide',
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
  routeStrategies: [
    { match: '/internal/:path(.*)?', exclude: true },
    { match: '/healthz', exclude: true },
    { match: '/webhooks/:path(.*)?', exclude: true },
  ],
  emitTsDeclarations: true,
});
