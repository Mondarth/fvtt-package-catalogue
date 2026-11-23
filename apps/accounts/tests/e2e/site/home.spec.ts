import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import type enMessages from '../../../messages/en.json';

type Messages = typeof enMessages;
const messages = (locale: string) =>
  JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8')) as Messages;
const en = messages('en');
const es = messages('es');

/** Console errors a test expects, such as the browser's own for a page not found. */
let expected: RegExp[] = [];

test.beforeEach(({ page }) => {
  expected = [];
  // A page that only looks right can still have thrown.
  page.on('pageerror', error => {
    throw error;
  });
  page.on('console', message => {
    if (message.type() === 'error' && !expected.some(pattern => pattern.test(message.text()))) {
      throw new Error(message.text());
    }
  });
});

test('the home page says what the accounts are, in English by default', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(en.site_title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.home_heading);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the language picker switches the page into Spanish, saying it was translated by machine', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: en.language_label }).selectOption('es');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.home_heading);
  await expect(page.getByRole('note')).toHaveText(es.machine_translation_notice);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('an unknown page is not found', async ({ page }) => {
  expected = [/status of 404/];
  const response = await page.goto('/nowhere');
  expect(response?.status()).toBe(404);
  await expect(page.getByText(en.error_not_found)).toBeVisible();
});

test('the health check says the server is up', async ({ request }) => {
  const response = await request.get('/healthz');
  expect(await response.json()).toEqual({ status: 'ok' });
});
