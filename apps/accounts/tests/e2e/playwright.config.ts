import { defineConfig, devices } from '@playwright/test';

/** The port the built server is served on, apart from the catalogue's E2E server. */
export const E2E_PORT = 4274;

/**
 * The accounts' end-to-end tests, against the built server (`pnpm build` first), in Chromium, Firefox and WebKit.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
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
    env: { PORT: String(E2E_PORT), HOST: '127.0.0.1' },
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
  projects: [
    { name: 'chromium', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: 'site/**/*.spec.ts', use: { ...devices['Desktop Safari'] } },
  ],
});
