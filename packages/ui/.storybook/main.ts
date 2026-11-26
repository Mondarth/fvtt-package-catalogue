import type { StorybookConfig } from '@storybook/svelte-vite';

/**
 * Storybook for Mondarth's shared components: where they are reviewed, and, through the Vitest addon, tested. Stories
 * are written in Svelte (`*.stories.svelte`, with addon-svelte-csf), or in plain CSF (`*.stories.ts`) where the addon
 * cannot express one.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(svelte|ts)'],
  addons: ['@storybook/addon-svelte-csf', '@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/svelte-vite',
  core: { disableTelemetry: true },
};

export default config;
