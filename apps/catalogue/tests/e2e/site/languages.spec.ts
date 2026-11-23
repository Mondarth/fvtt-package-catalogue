import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

const en = messagesOf('en');
const es = messagesOf('es');

test.describe('for a visitor whose browser prefers Spanish', () => {
  test.use({ locale: 'es-ES' });

  test('the sign-in page is in Spanish, and says it was translated by machine', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle(es.site_title);
    await expect(page.getByRole('heading', { level: 1, name: es.sign_in_heading })).toBeVisible();
    await expect(page.getByText(es.sign_in_stores)).toBeVisible();
    await expect(page.getByRole('note')).toHaveText(es.machine_translation_notice);
  });

  test('the API page is in Spanish too', async ({ page }) => {
    await page.goto('/developers');
    await expect(page.getByRole('heading', { level: 1, name: es.developers_heading })).toBeVisible();
    await expect(page.getByText(es.endpoint_lookup_summary)).toBeVisible();
  });

  test('English can be chosen, and stays chosen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: es.language_label }).selectOption('en');
    await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('note')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
  });

  test.describe('a page that does not exist', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] });

    test('says so in Spanish', async ({ page }) => {
      await page.goto('/no-such-page');
      await expect(page.getByText(es.error_not_found)).toBeVisible();
    });
  });
});
