import { defineConfig } from 'vitest/config';

/**
 * Tests of the repository's own tooling: commitlint, semantic-release, the workflows and the CI
 * scripts. Each app under apps/ and package under packages/ has its own tests and configuration.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
