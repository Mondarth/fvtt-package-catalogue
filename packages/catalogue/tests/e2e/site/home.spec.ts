import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

const en = messagesOf('en');

test('the home page asks a visitor to sign in, saying first what that stores, in English by default', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(en.site_title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
  await expect(page.getByText(en.sign_in_stores)).toBeVisible();
  await expect(
    page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toHaveCount(0);

  await page.getByRole('link', { name: en.privacy_link }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.privacy_heading })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(12);
});

test('every page has the logo, linking home, and the icons', async ({ page, request }) => {
  await page.goto('/privacy');
  await page.getByRole('link', { name: en.home_link }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').all()) {
    const href = (await icon.getAttribute('href')) ?? '';
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test('the API page introduces the catalogue and lists its endpoints, from the sign-in page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: en.developers_link }).click();
  await expect(page).toHaveURL(/\/developers$/);
  await expect(page.getByRole('heading', { level: 1, name: en.developers_heading })).toBeVisible();
  const endpoints = page.getByRole('region', { name: en.endpoints_heading }).getByRole('listitem');
  await expect(endpoints).toHaveCount(6);
  await expect(endpoints.first()).toContainText('POST');
  await expect(endpoints.first()).toContainText('/api/v2/lookup');
  await expect(endpoints.nth(1)).toContainText('GET');
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
