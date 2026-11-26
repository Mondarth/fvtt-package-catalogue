import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Two kinds of test:
 *
 * - `unit`: what is not a component (dates, language names), in happy-dom;
 * - `storybook`: every story, as a test, in Chromium, its play function and its accessibility checks with it
 *   (`.storybook/preview.ts`). The components are tested here, where they are reviewed.
 */
export default defineConfig({
  plugins: [svelte()],
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['**/*.d.ts', '**/*.stories.svelte', '**/*.stories.ts'],
      reporter: ['text', 'html', ['lcov', { projectRoot: '../..' }], 'json-summary'],
      // As in the catalogue: branches are counted apart for components, as Svelte compiles each `{expression}` in markup
      // to `expression ?? ''`, a branch no string can take. A component's behaviour is in its stories.
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        'src/**/*.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/**/*.svelte': { statements: 100, branches: 50, functions: 100, lines: 100 },
      },
    },
    projects: [
      {
        extends: true,
        plugins: [svelteTesting()],
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          environment: 'happy-dom',
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
