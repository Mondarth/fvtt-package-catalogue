import { defaultServerConditions, defineConfig } from 'vite';

import { DEFINE, SOURCE } from './vite.config.js';

/**
 * Builds the worker, the process that migrates the database and keeps it up to date, into build/worker. It shares the
 * app's server code (`#lib/server`) but not SvelteKit, so it runs without the HTTP server. Everything is bundled, as in
 * the app's build.
 */
export default defineConfig({
  build: {
    ssr: 'src/worker/main.ts',
    outDir: 'build/worker',
    emptyOutDir: true,
    target: 'node24',
    sourcemap: true,
  },
  define: DEFINE,
  ssr: { noExternal: true, resolve: { conditions: [SOURCE, ...defaultServerConditions] } },
});
