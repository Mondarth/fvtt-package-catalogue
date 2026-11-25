import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

const en = messagesOf('en');
const es = messagesOf('es');

test('every page links the Terms and Conditions at its foot, which are the terms, in English', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('contentinfo').getByRole('link', { name: en.terms_link }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page).toHaveTitle(en.terms_title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mondarth: Terms and Conditions');
  await expect(page.getByRole('heading', { level: 3, name: 'X. Governing Law and Disputes' })).toBeVisible();
  await expect(page.getByText('Last updated: 25 November 2026.')).toBeVisible();
});

test.describe('for a visitor whose browser prefers Spanish', () => {
  test.use({ locale: 'es-ES' });

  test('the terms say first that they are in English, which governs', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('note').filter({ hasText: es.terms_in_english })).toBeVisible();
    await expect(page.getByRole('article')).toHaveAttribute('lang', 'en');
  });
});
