import { test as base, expect } from '@playwright/test';

/**
 * The website's tests' `test`. Every page fails its test on a console error or an uncaught exception, except those a
 * test expects (`allowedConsoleErrors`): a page can look right while throwing.
 *
 * For pages only: its guard needs a page, so it launches a browser for every test. The API's tests use Playwright's
 * own `test`, and run where no browser is installed.
 */
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
      const unexpected = errors.filter(error => !allowedConsoleErrors.some(allowed => allowed.test(error)));
      expect(unexpected, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
