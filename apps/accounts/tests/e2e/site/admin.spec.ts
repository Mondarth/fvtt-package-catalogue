import { E2E_ADMIN, FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';
import { choose, profileButton, signOut } from '../profile-menu.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');

/** A user's name with the provider, unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/**
 * Signs in through the stand-in provider, as a user it knows by name.
 *
 * @returns The workspace's bar
 */
async function signInAs(page: Page, name: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
  await expect(profileButton(page)).toBeVisible();
  return page.getByRole('navigation', { name: en.workspace_label });
}

/** Signs in as someone new, and signs out again, giving the user id they were given. */
async function aUser(page: Page, name: string): Promise<string> {
  await signInAs(page, name);
  const handle = (await profileButton(page).textContent())?.trim() ?? '';
  await signOut(page);
  return handle;
}

test.describe('the admin pages, for anyone but an admin', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] });

  test('are not found, and not offered', async ({ page }, info) => {
    const bar = await signInAs(page, nameFor('carol', info));
    await profileButton(page).click();
    await expect(bar.getByRole('link', { name: en.profile_link, exact: true })).toBeVisible();
    await expect(bar.getByRole('link', { name: en.admin_link, exact: true })).toHaveCount(0);
    const response = await page.goto('/admin/users');
    expect(response?.status()).toBe(404);
  });
});

test('an admin finds a user, views the site as them, and bans them, who is told why, all recorded', async ({
  page,
}, info) => {
  const dave = nameFor('dave', info);
  const handle = await aUser(page, dave);
  const nickname = `Dave ${info.project.name} ${String(Date.now()).slice(-6)}`;

  await signInAs(page, E2E_ADMIN);
  await choose(page, en.admin_link);
  await expect(page.getByRole('heading', { level: 1, name: en.admin_users_heading })).toBeVisible();
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill(handle);
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: handle, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: handle })).toBeVisible();

  // Viewing the site as them: the banner says so on every page, and what is changed is recorded as the admin's.
  await page.getByRole('button', { name: en.admin_impersonate_button }).click();
  const banner = page.getByRole('status').filter({ hasText: en.impersonation_banner.replace('{name}', handle) });
  await expect(banner).toBeVisible();
  await choose(page, en.profile_link);
  await page.getByRole('textbox', { name: en.nickname_label }).fill(nickname);
  await page.getByRole('button', { name: en.nickname_save }).click();
  await expect(page.getByRole('status').filter({ hasText: en.nickname_saved })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: en.impersonation_banner.split('{name}')[0] ?? '' }),
  ).toBeVisible();
  await page.getByRole('button', { name: en.impersonation_stop }).click();

  // Back as the admin, on the user's page, which lists what was done.
  await expect(page.getByRole('heading', { level: 1, name: nickname })).toBeVisible();
  await profileButton(page).click();
  await expect(page.getByRole('link', { name: en.admin_link, exact: true })).toBeVisible();
  const audit = page.getByRole('region', { name: en.admin_user_audit_heading });
  await expect(audit).toContainText(en.audit_action_user_impersonate);
  await expect(audit).toContainText(en.audit_action_profile_nickname);
  await expect(audit).toContainText(en.audit_action_user_stop_impersonating);

  await page.getByRole('textbox', { name: en.admin_ban_reason }).fill('Testing bans');
  await page.getByRole('button', { name: en.admin_ban_button }).click();
  await expect(page.getByRole('status').filter({ hasText: en.admin_done_ban })).toBeVisible();
  await expect(page.getByText(en.admin_banned_forever)).toBeVisible();

  // The banned user, signing in, is told so, and why.
  await signOut(page);
  await page.goto(`${FAKE_PROVIDER_URL}/as/${dave}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
  const refused = page.getByRole('alert');
  await expect(refused).toContainText(en.sign_in_banned_forever);
  await expect(refused).toContainText(en.sign_in_banned_reason.replace('{reason}', 'Testing bans'));

  // Back as the admin, to lift it.
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/users');
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill(handle);
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: nickname, exact: true }).click();
  await page.getByRole('button', { name: en.admin_unban_button }).click();
  await expect(page.getByRole('status').filter({ hasText: en.admin_done_unban })).toBeVisible();

  await page
    .getByRole('navigation', { name: en.admin_nav_label })
    .getByRole('link', { name: en.admin_nav_audit })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: en.admin_audit_heading })).toBeVisible();
  await expect(page.getByRole('table')).toContainText(en.audit_action_user_ban);
});

test("an admin's own page offers nothing an admin does to others", async ({ page }) => {
  await signInAs(page, E2E_ADMIN);
  await choose(page, en.admin_link);
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill('e2e-admin-handle');
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: 'e2e-admin-handle', exact: true }).click();
  await expect(page.getByText(en.admin_self)).toBeVisible();
  await expect(page.getByRole('button', { name: en.admin_ban_button })).toHaveCount(0);
  await expect(page.getByRole('button', { name: en.admin_impersonate_button })).toHaveCount(0);
});

test.describe('subscriptions', () => {
  // The browser reports the form's 400, for a grant only the server can refuse, as an error.
  test.use({ allowedConsoleErrors: [/status of 400/] });

  test('an admin grants a user a month, which the user sees, and makes and retires an offer', async ({
    page,
  }, info) => {
    const erin = nameFor('erin', info);
    const handle = await aUser(page, erin);
    const offerName = `Offer ${info.project.name} ${String(Date.now()).slice(-6)}`;

    await signInAs(page, E2E_ADMIN);
    await choose(page, en.admin_link);
    await page.getByRole('searchbox', { name: en.admin_search_label }).fill(handle);
    await page.getByRole('button', { name: en.admin_search_button }).click();
    await page.getByRole('table').getByRole('link', { name: handle, exact: true }).click();

    const subscription = page.getByRole('region', { name: en.admin_subscription_heading });
    await expect(subscription).toContainText(en.admin_subscription_none);
    const months = subscription.getByRole('spinbutton', { name: en.admin_grant_months });

    // Too long a grant is flagged by the browser, by the field, and not sent.
    await months.fill('10000000000000');
    await subscription.getByRole('button', { name: en.admin_grant_button }).click();
    expect(await months.evaluate(input => (input as HTMLInputElement).validity.rangeOverflow)).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);

    // What only the server can refuse is said beside the form, which the eye is drawn to.
    await months.fill('0');
    await subscription.getByRole('button', { name: en.admin_grant_button }).click();
    const callout = page.getByRole('alert');
    await expect(callout).toHaveText(en.admin_problem_period);
    await expect(callout).toBeFocused();
    await expect(subscription.getByRole('spinbutton', { name: en.admin_grant_months })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await subscription.getByRole('spinbutton', { name: en.admin_grant_months }).fill('1');
    await subscription.getByRole('textbox', { name: en.admin_note }).first().fill('Welcome');
    await subscription.getByRole('button', { name: en.admin_grant_button }).click();
    await expect(page.getByRole('status').filter({ hasText: en.admin_done_grant })).toBeVisible();
    await expect(subscription).toContainText('Welcome');
    await expect(page.getByRole('region', { name: en.admin_user_audit_heading })).toContainText(
      en.audit_action_subscription_grant,
    );

    // An earlier end, still to come, which cuts every credit back to it: the user stays subscribed until then.
    const earlier = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await subscription.getByLabel(en.admin_set_end_date).fill(earlier);
    await subscription.getByRole('button', { name: en.admin_set_end_button }).click();
    await expect(page.getByRole('status').filter({ hasText: en.admin_done_set_end })).toBeVisible();

    // An offer, made and retired.
    await page
      .getByRole('navigation', { name: en.admin_nav_label })
      .getByRole('link', { name: en.admin_nav_subscriptions })
      .click();
    await page.getByRole('textbox', { name: en.admin_offer_name }).fill(offerName);
    await page.getByRole('spinbutton', { name: en.admin_grant_months }).fill('12');
    await page.getByRole('textbox', { name: en.admin_offer_prices }).fill('GBP 30.00\nEUR 35.00');
    await page.getByRole('button', { name: en.admin_offer_create }).click();
    await expect(page.getByRole('status').filter({ hasText: en.admin_done_create })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: offerName });
    await expect(row).toContainText('£30.00');
    await row.getByRole('button', { name: `${en.admin_offer_retire}: ${offerName}` }).click();
    await expect(page.getByRole('status').filter({ hasText: en.admin_done_retire })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: offerName })).not.toContainText(en.admin_offer_on_sale);

    // The user sees their month.
    await signOut(page);
    await signInAs(page, erin);
    await choose(page, en.subscription_link);
    await expect(page.getByRole('heading', { level: 1, name: en.subscription_heading })).toBeVisible();
    await expect(page.getByText(/^Subscribed until /)).toBeVisible();
    await expect(page.getByRole('table')).toContainText(en.subscription_source_grant);
    await expect(page.getByRole('table')).toContainText('1 month');
    await expect(page.getByRole('table')).not.toContainText('Welcome');
  });
});

test('an admin adds an eligibility under another, from its menu, and it is selected in the tree', async ({
  page,
}, info) => {
  // Every browser adds its own, at once, to the same accounts.
  const name = `AIDE beta ${info.project.name} ${String(Date.now()).slice(-6)}`;
  await signInAs(page, E2E_ADMIN);
  await page.goto('/admin/eligibilities');
  const tree = page.getByRole('tree', { name: en.admin_eligibilities_tree });
  // The tree the accounts begin with.
  for (const begun of ['Mondarth', 'Apps', 'Catalogue', 'AIDE']) {
    await expect(tree.getByRole('treeitem', { name: new RegExp(`^${begun}`) }).first()).toBeVisible();
  }

  await tree.getByRole('treeitem', { name: /^AIDE/ }).locator('.row').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: en.admin_eligibility_add }).click();
  const dialog = page.getByRole('dialog', { name: en.admin_eligibility_add_under.replace('{name}', 'AIDE') });
  await dialog.getByLabel(en.admin_eligibility_name).fill(name);
  await dialog.getByRole('button', { name: en.admin_eligibility_add }).click();

  const added = tree.getByRole('treeitem', { name: new RegExp(`^${name}`) });
  await expect(added).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: /^AIDE/ }).first().getByRole('group')).toContainText(name);
});
