import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'html', ['lcov', { projectRoot: '../..' }], 'json-summary'],
      // As in the catalogue: branches are counted apart for components, as Svelte compiles each `{expression}` in markup
      // to `expression ?? ''`, a branch no string can take. A component's behaviour is in its tests.
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        'src/**/*.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/**/*.svelte': { statements: 100, branches: 50, functions: 100, lines: 100 },
      },
    },
  },
});
