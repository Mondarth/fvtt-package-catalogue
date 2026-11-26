import { E2E_ADMIN, FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';
import { profileButton, signOut } from '../profile-menu.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), message);

/** A name unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/** Every introductory offer these tests make gives seven days, so that whichever is on sale, its button is this. */
const CLAIM = fill(en.subscription_introductory_claim, { period: '7 days' });

async function signInAs(page: Page, name: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
  await expect(profileButton(page)).toBeVisible();
}

test('a new account claims an introductory offer once, which a profile made again by the same person cannot', async ({
  page,
}, info) => {
  const offerName = nameFor('Week free', info);
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  await page.getByRole('textbox', { name: en.admin_offer_name }).fill(offerName);
  await page.getByRole('spinbutton', { name: en.admin_grant_days }).fill('7');
  await page.getByRole('checkbox', { name: en.admin_offer_introductory }).check();
  await page.getByRole('button', { name: en.admin_offer_create }).click();
  const row = page.getByRole('row').filter({ hasText: offerName });
  await expect(row).toContainText(en.admin_offer_introductory_badge);
  await signOut(page);

  // A new account claims it, and is subscribed for its seven days; it is offered no more.
  const person = nameFor('newcomer', info);
  await signInAs(page, person);
  await page.goto('/subscription');
  await page.getByRole('button', { name: CLAIM }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_introductory_claimed })).toBeVisible();
  await expect(page.getByText(/^Subscribed until /)).toBeVisible();
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_source_introductory,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: CLAIM })).toHaveCount(0);

  // They delete their profile, and make another: the same person, known by their address, claims none again.
  await page.goto('/profile');
  await page.getByRole('checkbox', { name: en.delete_confirm }).check();
  await page.getByRole('button', { name: en.delete_button }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
  await signInAs(page, person);
  await page.goto('/subscription');
  await expect(page.getByText(en.subscription_none)).toBeVisible();
  await expect(page.getByRole('button', { name: CLAIM })).toHaveCount(0);
  await signOut(page);

  // Retired, so that it is on sale no longer to the other tests' accounts.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  await row.getByRole('button', { name: `${en.admin_offer_retire}: ${offerName}` }).click();
  await expect(row).toContainText(/Retired/);
});
