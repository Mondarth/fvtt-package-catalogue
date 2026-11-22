import { E2E_ADMIN, FAKE_PROVIDER_URL, FAKE_STRIPE_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), message);

/** A name unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/**
 * Signs in, through the test provider, as a user it knows by name.
 *
 * @param page - The page
 * @param name - The user
 */
async function signInAs(page: Page, name: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
  await expect(page.getByRole('navigation', { name: en.workspace_label })).toBeVisible();
}

/**
 * Signs out, from the profile page.
 *
 * @param page - The page
 */
async function signOut(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: en.sign_out, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
}

test('an admin sells an offer through Stripe, which a user buys, consenting, and is subscribed by', async ({
  page,
}, info) => {
  const offerName = nameFor('Month', info);

  // The admin makes an offer with a price in pounds: it is sold through Stripe.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  await expect(page.getByText(fill(en.admin_offer_stripe_hint, { currency: 'GBP' }))).toBeVisible();
  await page.getByRole('textbox', { name: en.admin_offer_name }).fill(offerName);
  await page.getByRole('spinbutton', { name: en.admin_grant_months }).fill('1');
  await page.getByRole('textbox', { name: en.admin_offer_prices }).fill('GBP 3.00');
  await page.getByRole('button', { name: en.admin_offer_create }).click();
  const row = page.getByRole('row').filter({ hasText: offerName });
  await expect(row).toContainText(en.admin_offer_stripe);
  await signOut(page);

  // A user buys it: its price is before tax, and they must ask for their time to start at once.
  await signInAs(page, nameFor('buyer', info));
  await page.goto('/subscription');
  const offer = page.getByRole('listitem').filter({ hasText: offerName });
  await expect(offer).toContainText(fill(en.subscription_price_before_tax, { price: '£3.00' }));
  // One consent for every offer: until it is given, no Buy works.
  const buy = offer.getByRole('button', { name: fill(en.subscription_buy_named, { name: offerName }) });
  await expect(buy).toBeDisabled();
  await page.getByRole('checkbox', { name: en.subscription_buy_consent }).check();
  await buy.click();

  // Stripe's checkout page, stood in for: paying sends the catalogue its event, and the buyer back.
  await expect(page).toHaveURL(new RegExp(`^${FAKE_STRIPE_URL}/pay/`));
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page).toHaveURL(/\/subscription\?checkout=done$/);
  await expect(page.getByRole('status').filter({ hasText: en.subscription_checkout_done })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Subscribed until /)).toBeVisible();
  const history = page.getByRole('region', { name: en.subscription_history_heading });
  await expect(history).toContainText(en.subscription_source_payment);

  // A subscriber adding time gives the consent again; leaving the checkout charges nothing.
  await expect(page.getByText(en.subscription_gives)).toHaveCount(0);
  await page.getByRole('checkbox', { name: en.subscription_buy_consent }).check();
  await buy.click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_checkout_cancelled })).toBeVisible();
  await expect(history.getByRole('row')).toHaveCount(2);
});
