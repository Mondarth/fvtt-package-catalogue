import { readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { connect } from '../../../src/lib/server/db/connect.js';
import { subscriptionCredits } from '../../../src/lib/server/subscriptions/schema.js';
import { E2E_ADMIN, E2E_ENV, FAKE_PROVIDER_URL, FAKE_STRIPE_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

import type { Locator, Page, TestInfo } from '@playwright/test';

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

/**
 * The handle of the buyer a row of an admin table names.
 *
 * @param page - The page
 * @param row - The row
 * @returns The handle
 */
async function handleOf(page: Page, row: Locator) {
  return ((await row.getByRole('rowheader').textContent()) ?? '').trim();
}

/**
 * Has a purchase look bought so many days ago, as only the database can: the end-to-end tests cannot wait 14 days.
 *
 * @param paymentIntent - The purchase's payment
 * @param days - How many days ago
 */
async function boughtAgo(paymentIntent: string, days: number) {
  const connection = connect(E2E_ENV.DATABASE_URL);
  try {
    await connection.db
      .update(subscriptionCredits)
      .set({ createdAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) })
      .where(eq(subscriptionCredits.externalRef, paymentIntent));
  } finally {
    await connection.close();
  }
}

/**
 * Opens a purchase's refund dialog, from the purchase history.
 *
 * @param page - The page, on the Subscription page
 * @returns The dialog
 */
async function refundDialog(page: Page) {
  await page
    .getByRole('region', { name: en.subscription_history_heading })
    .getByRole('button', { name: /Cancel the purchase of/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a buyer cancels within 14 days, sees the refund and what it ends, confirms, and is refunded at once', async ({
  page,
}, info) => {
  await bought(page, info);
  await page.reload();
  const dialog = await refundDialog(page);
  await expect(dialog).toHaveAccessibleName(en.subscription_refund_dialog_cancel_heading);
  await expect(dialog).toContainText(en.subscription_refund_dialog_at_once);
  // Their only time: cancelling it ends their subscription, which they are told.
  await expect(dialog).toContainText(en.subscription_refund_dialog_ends);
  await expect(dialog.getByRole('combobox')).toHaveCount(0);

  // Cancel closes it, asking nothing.
  await dialog.getByRole('button', { name: en.subscription_refund_dismiss }).click();
  await expect(dialog).toBeHidden();

  await (await refundDialog(page)).getByRole('button', { name: en.subscription_refund_confirm }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_refund_done_at_once })).toBeVisible();
  // Stripe's event of the refund arrives a moment later, and takes the time back: the page shows it without a reload.
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_refund_refunded,
    { timeout: 15_000 },
  );
  // What of it was used is kept, in whole days rounded down: it runs out today or tomorrow, not a month later.
  const soon = [0, 1].map(days =>
    fill(en.subscription_active, { date: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en') }),
  );
  expect(soon).toContain(await page.getByText(/^Subscribed until /).textContent());
});

test('a buyer asks for a refund after 14 days, saying why, which an admin sees and makes', async ({ page }, info) => {
  const { paymentIntent } = await bought(page, info);
  await boughtAgo(paymentIntent, 20);
  await page.reload();

  const dialog = await refundDialog(page);
  await expect(dialog).toHaveAccessibleName(en.subscription_refund_dialog_request_heading);
  await expect(dialog).toContainText(en.subscription_refund_dialog_later);
  await dialog.getByRole('combobox', { name: en.subscription_refund_reason }).selectOption('other');
  await dialog.getByRole('textbox', { name: en.subscription_refund_reason_text }).fill('Moving to another tool');
  await dialog.getByRole('button', { name: en.subscription_refund_confirm }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_refund_done })).toBeVisible();
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_refund_requested,
  );
  await signOut(page);

  // The admin sees it, with the buyer's reason, and makes it in Stripe's dashboard, stood in for.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  const requests = page.getByRole('region', { name: en.admin_refunds_heading });
  // Its row, by the payment its link names: earlier runs' requests may be listed too.
  const asked = requests.getByRole('row').filter({ has: page.locator(`a[href$="/payments/${paymentIntent}"]`) });
  await expect(asked).toContainText(`${en.subscription_refund_reason_other} Moving to another tool`);
  expect((await page.request.get(`${FAKE_STRIPE_URL}/refund/${paymentIntent}?refunded=100`)).status()).toBe(200);
  await page.reload();
  await expect(asked).toHaveCount(0);
});

test('a cancellation Stripe will not refund at once is left to an admin', async ({ page }, info) => {
  const { paymentIntent } = await bought(page, info);
  await page.request.get(`${FAKE_STRIPE_URL}/refunds-fail/${paymentIntent}`);
  await page.reload();
  await (await refundDialog(page)).getByRole('button', { name: en.subscription_refund_confirm }).click();
  await expect(page.getByRole('status').filter({ hasText: en.subscription_refund_done })).toBeVisible();
  await signOut(page);

  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  await expect(
    page
      .getByRole('region', { name: en.admin_refunds_heading })
      .getByRole('row')
      .filter({ has: page.locator(`a[href$="/payments/${paymentIntent}"]`) }),
  ).toHaveCount(1);
});

test('a dispute is listed for admins while open, and once lost charges the purchase back', async ({ page }, info) => {
  const { buyer, paymentIntent } = await bought(page, info);
  expect((await page.request.get(`${FAKE_STRIPE_URL}/dispute/${paymentIntent}?status=needs_response`)).status()).toBe(
    200,
  );
  await signOut(page);

  // The admin sees it among the outstanding disputes, with where to answer it, until it is decided.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  const disputed = page
    .getByRole('region', { name: en.admin_disputes_heading })
    .getByRole('row')
    .filter({ has: page.locator(`a[href$="/payments/${paymentIntent}"]`) });
  await expect(disputed).toHaveCount(1);

  // Its evidence, downloaded: the purchase, the buyer's consent, and how they sign in.
  const downloading = page.waitForEvent('download');
  await disputed.getByRole('link', { name: /dispute evidence/ }).click();
  const evidence = await downloading;
  expect(evidence.suggestedFilename()).toBe(`dispute-evidence-${await handleOf(page, disputed)}-${paymentIntent}.txt`);
  const text = readFileSync(await evidence.path(), 'utf8');
  expect(text).toContain(`  Payment: ${paymentIntent} (a sandbox payment)`);
  expect(text).toContain('  Paid, tax included: GBP 3.60');
  expect(text).toContain('the buyer ticked "I ask that my time be activated as soon as I pay');
  expect(text).toContain('  Dispute: open, opened ');

  expect((await page.request.get(`${FAKE_STRIPE_URL}/dispute/${paymentIntent}?status=lost`)).status()).toBe(200);
  await page.reload();
  await expect(disputed).toHaveCount(0);
  await signOut(page);

  await signInAs(page, buyer);
  await page.goto('/subscription');
  await expect(page.getByRole('region', { name: en.subscription_history_heading })).toContainText(
    en.subscription_refund_refunded,
  );
  await expect(page.getByText(/^Subscribed until /)).toHaveCount(0);
});
