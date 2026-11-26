import { E2E_ADMIN, FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';
import { profileButton, signOut } from '../profile-menu.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), message);

/** A user's name with the providers, unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/**
 * Has the Patreon stand-in say a user pledges so much to the catalogue's campaign.
 *
 * @param page - The page, whose request context reaches the stand-in
 * @param name - The user, as the stand-in knows them
 * @param cents - What they pledge, in pence
 * @param status - Their status
 */
async function pledge(page: Page, name: string, cents: number, status = 'active_patron') {
  await page.request.get(`${FAKE_PROVIDER_URL}/patreon/${name}?status=${status}&cents=${String(cents)}`);
}

/**
 * Signs in, through the test provider, as a user it knows by name, who is the same name with the Patreon stand-in.
 *
 * @param page - The page
 * @param name - The user
 * @param provider - The provider to sign in with
 */
async function signInAs(page: Page, name: string, provider = 'Test provider') {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', provider) }).click();
  await expect(profileButton(page)).toBeVisible();
}

const patreonOf = (page: Page) => page.getByRole('region', { name: en.subscription_patreon_heading });

test('a patron links Patreon, is subscribed by their pledge, sees it change, and unlinks it', async ({
  page,
}, info) => {
  const name = nameFor('pat', info);
  await pledge(page, name, 500);
  await signInAs(page, name);
  await page.goto('/subscription');
  const patreon = patreonOf(page);
  await expect(patreon).toContainText(fill(en.subscription_patreon_intro, { amount: '£3.00' }));
  await expect(page.getByText(en.subscription_none)).toBeVisible();

  await patreon.getByRole('button', { name: en.subscription_patreon_link }).click();
  await expect(patreon.getByRole('status')).toHaveText(en.subscription_patreon_done_linked);
  await expect(patreon).toContainText(en.subscription_patreon_subscribed);
  await expect(page.getByText(en.subscription_by_patreon)).toBeVisible();

  // A pledge cut below the least is seen once Patreon is asked again.
  await pledge(page, name, 200);
  await patreon.getByRole('button', { name: en.subscription_patreon_check }).click();
  await expect(patreon.getByRole('status')).toHaveText(en.subscription_patreon_done_checked);
  await expect(patreon).toContainText(fill(en.subscription_patreon_below, { amount: '£2.00', minimum: '£3.00' }));
  await expect(page.getByText(en.subscription_none)).toBeVisible();

  await patreon.getByRole('button', { name: en.subscription_patreon_unlink }).click();
  await expect(patreon.getByRole('status')).toHaveText(en.subscription_patreon_done_unlinked);
  await expect(patreon.getByRole('button', { name: en.subscription_patreon_link })).toBeVisible();
});

test.describe('Patreon refusing', () => {
  // The browser reports the form's 400, for unlinking the only way to sign in, as an error.
  test.use({ allowedConsoleErrors: [/status of 400/] });

  test("one Patreon account is one user's alone", async ({ page }, info) => {
    const patron = nameFor('owner', info);
    await pledge(page, patron, 500);
    await signInAs(page, patron, 'Patreon');
    await signOut(page);

    // Another user, signed in another way, tries to link the same Patreon account.
    await signInAs(page, nameFor('other', info));
    await page.goto(`${FAKE_PROVIDER_URL}/as/${patron}`);
    await page.goto('/subscription');
    await patreonOf(page).getByRole('button', { name: en.subscription_patreon_link }).click();
    await expect(patreonOf(page).getByRole('alert')).toHaveText(en.subscription_patreon_error_taken);
  });

  test('signing in with Patreon links it, and a patron is subscribed at once', async ({ page }, info) => {
    const name = nameFor('patsign', info);
    await pledge(page, name, 300);
    await signInAs(page, name, 'Patreon');
    await page.goto('/subscription');
    await expect(patreonOf(page)).toContainText(en.subscription_patreon_subscribed);
    // It is how they sign in alone, so it cannot be unlinked.
    await patreonOf(page).getByRole('button', { name: en.subscription_patreon_unlink }).click();
    await expect(patreonOf(page).getByRole('alert')).toHaveText(en.subscription_patreon_error_only);
  });
});

test('what Patreon last said still counts while it cannot be asked', async ({ page }, info) => {
  const name = nameFor('outage', info);
  await pledge(page, name, 500);
  await signInAs(page, name, 'Patreon');
  // Patreon answers once, and then cannot be asked.
  await page.goto('/subscription');
  await expect(patreonOf(page)).toContainText(en.subscription_patreon_subscribed);
  await page.request.get(`${FAKE_PROVIDER_URL}/patreon-down/${name}`);
  await patreonOf(page).getByRole('button', { name: en.subscription_patreon_check }).click();
  await expect(patreonOf(page)).toContainText(en.subscription_patreon_subscribed);
  await expect(patreonOf(page)).toContainText(en.subscription_patreon_unreachable);
});

test('an admin sets the least pledge, and sees what Patreon said of a patron', async ({ page }, info) => {
  const name = nameFor('seen', info);
  await pledge(page, name, 500);
  await signInAs(page, name, 'Patreon');
  // Their own use of the site asks Patreon; the admin's page shows what was kept.
  await page.goto('/subscription');
  await expect(patreonOf(page)).toContainText(en.subscription_patreon_subscribed);
  await page.goto('/profile');
  const handle = (await page.locator('code').first().textContent())?.trim() ?? '';
  await signOut(page);

  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/subscriptions');
  const minimum = page.getByRole('region', { name: en.admin_patreon_heading });
  await expect(minimum).toContainText(fill(en.admin_patreon_set, { amount: '£3.00' }));
  await minimum.getByRole('textbox', { name: en.admin_patreon_label }).fill('GBP 3.00');
  await minimum.getByRole('button', { name: en.admin_patreon_save }).click();
  await expect(page.getByRole('status')).toHaveText(en.admin_done_patreon);

  await page.goto('/admin/users');
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill(handle);
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: handle, exact: true }).click();
  await expect(page.getByRole('region', { name: en.admin_subscription_heading })).toContainText(
    en.admin_patreon_subscribes,
  );
});
