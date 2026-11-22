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

/**
 * Makes a month's offer at £3.00, as the admin, and buys it, as a new user, who stays signed in.
 *
 * @param page - The page
 * @param info - The test, whose names it uses
 * @returns The offer's name, and the payment's PaymentIntent, as the stand-in names it
 */
async function bought(page: Page, info: TestInfo) {
  const offerName = nameFor('Month', info);
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  await page.getByRole('textbox', { name: en.admin_offer_name }).fill(offerName);
  await page.getByRole('spinbutton', { name: en.admin_grant_months }).fill('1');
  await page.getByRole('textbox', { name: en.admin_offer_prices }).fill('GBP 3.00');
  await page.getByRole('button', { name: en.admin_offer_create }).click();
  await expect(page.getByRole('row').filter({ hasText: offerName })).toContainText(en.admin_offer_stripe);
  await signOut(page);

  const buyer = nameFor('refunded', info);
  await signInAs(page, buyer);
  await page.goto('/subscription');
  await page.getByRole('checkbox', { name: en.subscription_buy_consent }).check();
  await page.getByRole('button', { name: fill(en.subscription_buy_named, { name: offerName }) }).click();
  const session = new URL(page.url()).pathname.split('/').pop() ?? '';
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_checkout_done })).toBeVisible();
  return { buyer, paymentIntent: `pi_for_${session}` };
}

test('a buyer cancels and asks for a refund, which an admin makes, taking its time back', async ({ page }, info) => {
  const { buyer, paymentIntent } = await bought(page, info);
  await page.reload();
  const history = page.getByRole('region', { name: en.subscription_history_heading });
  await expect(history).toContainText('£3.60');

  // Asked for on the page, and confirmed there at once.
  await history.getByRole('button', { name: /Cancel the purchase of/ }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_refund_done })).toBeVisible();
  await expect(history).toContainText(en.subscription_refund_requested);
  await signOut(page);

  // The admin sees it, with all of it owed: none of its time is used yet, as it started just now.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  const requests = page.getByRole('region', { name: en.admin_refunds_heading });
  // Its row, by the payment its link names: earlier runs' requests may be listed too.
  const asked = requests.getByRole('row').filter({ has: page.locator(`a[href$="/payments/${paymentIntent}"]`) });
  await expect(asked).toContainText('£3.60');
  await expect(asked.getByRole('link', { name: en.admin_refunds_make })).toHaveAttribute(
    'href',
    /\/test\/payments\/pi_for_/,
  );

  // The admin refunds it in Stripe's dashboard, stood in for: its time is taken back, and it leaves the list.
  const refunded = await page.request.get(`${FAKE_STRIPE_URL}/refund/${paymentIntent}?refunded=360`);
  expect(refunded.status()).toBe(200);
  await page.reload();
  await expect(asked).toHaveCount(0);
  await signOut(page);

  await signInAs(page, buyer);
  await page.goto('/subscription');
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_refund_refunded,
  );
  await expect(page.getByText(/^Subscribed until /)).toHaveCount(0);
});

test('a dispute lost with the bank charges a purchase back, taking its time', async ({ page }, info) => {
  const { paymentIntent } = await bought(page, info);
  expect((await page.request.get(`${FAKE_STRIPE_URL}/dispute/${paymentIntent}?status=needs_response`)).status()).toBe(
    200,
  );
  expect((await page.request.get(`${FAKE_STRIPE_URL}/dispute/${paymentIntent}?status=lost`)).status()).toBe(200);
  await page.goto('/subscription');
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_refund_refunded,
  );
  await expect(page.getByText(/^Subscribed until /)).toHaveCount(0);
});
