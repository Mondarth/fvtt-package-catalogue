import { fileURLToPath } from 'node:url';

import { defaultServerConditions, defineConfig } from 'vite';

/** Builds the migrations' command (`src/migrate.ts`) into build/migrate.js, with everything it uses bundled. */
export default defineConfig({
  resolve: { alias: { '#lib': fileURLToPath(new URL('src/lib', import.meta.url)) } },
  build: {
    ssr: 'src/migrate.ts',
    outDir: 'build',
    emptyOutDir: false,
    target: 'node24',
    sourcemap: true,
    rolldownOptions: { output: { entryFileNames: 'migrate.js' } },
  },
  ssr: { noExternal: true, resolve: { conditions: [...defaultServerConditions] } },
});
