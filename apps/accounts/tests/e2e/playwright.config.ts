import { defineConfig, devices } from '@playwright/test';

import {
  E2E_ENV,
  E2E_STRIPE_WEBHOOK_SECRET,
  E2E_URL,
  FAKE_PROVIDER_PORT,
  FAKE_PROVIDER_URL,
  FAKE_STRIPE_PORT,
  FAKE_STRIPE_URL,
  FORWARDED_PROTO,
} from './environment.js';

/**
 * The accounts' end-to-end tests, against the built server (`pnpm build` first) and a throwaway PostgreSQL
 * (`pnpm e2e:db`), with stand-ins for the sign-in providers, Patreon and Stripe: the internal API once, and the website
 * in Chromium, Firefox and WebKit.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: './playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: E2E_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: [
    {
      command: 'node build/index.js',
      cwd: '../..',
      url: `${E2E_URL}/healthz`,
      env: E2E_ENV,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: 'node tests/e2e/fake-provider.ts',
      cwd: '../..',
      url: `${FAKE_PROVIDER_URL}/healthz`,
      env: { FAKE_PROVIDER_PORT: String(FAKE_PROVIDER_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node tests/e2e/fake-stripe.ts',
      cwd: '../..',
      url: `${FAKE_STRIPE_URL}/healthz`,
      env: {
        FAKE_STRIPE_PORT: String(FAKE_STRIPE_PORT),
        SITE_URL: E2E_ENV.SITE_URL,
        STRIPE_WEBHOOK_SECRET: E2E_STRIPE_WEBHOOK_SECRET,
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'internal', testMatch: 'internal/**/*.spec.ts' },
    {
      name: 'chromium',
      testMatch: 'site/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], extraHTTPHeaders: FORWARDED_PROTO },
    },
    {
      name: 'firefox',
      testMatch: 'site/**/*.spec.ts',
      use: { ...devices['Desktop Firefox'], extraHTTPHeaders: FORWARDED_PROTO },
    },
    {
      name: 'webkit',
      testMatch: 'site/**/*.spec.ts',
      use: { ...devices['Desktop Safari'], extraHTTPHeaders: FORWARDED_PROTO },
    },
  ],
});
