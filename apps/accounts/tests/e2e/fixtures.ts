import { test as base, expect } from '@playwright/test';

/**
 * The website's tests' `test`. Every page fails its test on a console error or an uncaught exception, except those a
 * test expects (`allowedConsoleErrors`): a page can look right while throwing.
 *
 * For pages only: its guard needs a page, so it launches a browser for every test. The API's tests use Playwright's
 * own `test`, and run where no browser is installed.
 */
/**
 * What browsers report as an error of their own, not the page's: Firefox and WebKit report a page's script whose loading
 * was cut off, as a test goes to another page while one is still loading, as an error loading it. A script that truly
 * failed to load leaves the page broken, which the test's own expectations then catch.
 */
const NAVIGATED_AWAY = [/^error loading dynamically imported module: /, /^Importing a module script failed\.?$/];

export const test = base.extend<{ allowedConsoleErrors: RegExp[]; consoleErrors: string[] }>({
  allowedConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', error => errors.push(error.message));
      await use(errors);
      const allowed = [...NAVIGATED_AWAY, ...allowedConsoleErrors];
      const unexpected = errors.filter(error => !allowed.some(pattern => pattern.test(error)));
      expect(unexpected, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
