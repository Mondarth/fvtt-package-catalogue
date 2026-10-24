import { defineConfig, devices } from '@playwright/test';

import { E2E_API_KEY, E2E_ENV, E2E_PORT } from './environment.js';

/**
 * End-to-end tests of the built server and worker (`pnpm build`) against PostgreSQL (`pnpm e2e:db`). The API's tests
 * make HTTP requests, so they run once; the website's run in each browser. The worker's run after the API's, as what it
 * crawls changes what they expect.
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
    baseURL: `http://127.0.0.1:${String(E2E_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'node build/index.js',
    cwd: '../..',
    url: `http://127.0.0.1:${String(E2E_PORT)}/healthz`,
    env: E2E_ENV,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
  projects: [
    { name: 'api', testMatch: 'api/**/*.spec.ts', use: { extraHTTPHeaders: { 'X-API-Key': E2E_API_KEY } } },
    {
      name: 'worker',
      testMatch: 'worker/**/*.spec.ts',
      dependencies: ['api'],
      use: { extraHTTPHeaders: { 'X-API-Key': E2E_API_KEY } },
    },
    { name: 'chromium', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Safari'] } },
  ],
});
