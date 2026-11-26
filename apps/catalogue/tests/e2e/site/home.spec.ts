import { expect, test } from '../fixtures.js';
import { ACCOUNTS_URL, E2E_URL } from '../environment.js';
import { messagesOf } from '../messages.js';

const en = messagesOf('en');

test('the home page says what the catalogue is, and the bar sends a visitor to sign in at the accounts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(en.site_title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // Its site's colour, among the design tokens', is the catalogue's.
  await expect(page.locator('html')).toHaveAttribute('data-site', 'catalogue');
  await expect(page.getByRole('heading', { level: 1, name: en.site_title })).toBeVisible();
  await expect(page.getByText(en.home_lede)).toBeVisible();
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.getByRole('link', { name: en.sign_in_register })).toHaveAttribute(
    'href',
    `${ACCOUNTS_URL}/?next=${encodeURIComponent(`${E2E_URL}/`)}`,
  );
  await expect(page.getByRole('link', { name: en.privacy_link })).toHaveAttribute('href', `${ACCOUNTS_URL}/privacy`);
  await expect(page.getByRole('link', { name: en.terms_link })).toHaveAttribute('href', `${ACCOUNTS_URL}/terms`);
});

test('every page has the logo, linking home, and the icons', async ({ page, request }) => {
  await page.goto('/developers');
  await page.getByRole('link', { name: en.home_link }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.site_title })).toBeVisible();
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').all()) {
    const href = (await icon.getAttribute('href')) ?? '';
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test('the API page introduces the catalogue and lists its endpoints, from the home page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: en.developers_link }).click();
  await expect(page).toHaveURL(/\/developers$/);
  await expect(page.getByRole('heading', { level: 1, name: en.developers_heading })).toBeVisible();
  const endpoints = page.getByRole('region', { name: en.endpoints_heading }).getByRole('listitem');
  await expect(endpoints).toHaveCount(7);
  await expect(endpoints.first()).toContainText('POST');
  await expect(endpoints.first()).toContainText('/api/v2/lookup');
  await expect(endpoints.first()).toContainText(en.endpoint_callers_module);
  await expect(endpoints.nth(1)).toContainText('GET');
  await expect(endpoints.last()).toContainText('/api/v2/me');
  await expect(page.getByText(en.developers_auth)).toBeVisible();
});

test('the pages that moved to the accounts are sent there, with their query', async ({ request }) => {
  for (const path of ['/profile', '/subscription?checkout=done', '/privacy', '/admin/users', '/device?user_code=X']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location).toBe(`${ACCOUNTS_URL}${path}`);
  }
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
