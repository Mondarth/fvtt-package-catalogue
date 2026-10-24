import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

const en = messagesOf('en');

test('the home page introduces the catalogue and lists its endpoints, in English by default', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(en.site_title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: en.site_title })).toBeVisible();
  const endpoints = page.getByRole('region', { name: en.endpoints_heading }).getByRole('listitem');
  await expect(endpoints).toHaveCount(3);
  await expect(endpoints.first()).toContainText('/api/v1/packages/{type}/{id}/releases');
  await expect(endpoints.nth(1)).toContainText('POST');
  await expect(page.getByRole('note')).toHaveCount(0);
});

test.describe('a page that does not exist', () => {
  // The browser reports the page's own 404 as an error.
  test.use({ allowedConsoleErrors: [/status of 404/] });

  test('says so', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Error 404' })).toBeVisible();
    await expect(page.getByText(en.error_not_found)).toBeVisible();
  });
});
