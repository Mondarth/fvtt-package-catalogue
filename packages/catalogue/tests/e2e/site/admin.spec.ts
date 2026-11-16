import { E2E_ADMIN, FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

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
  const bar = page.getByRole('navigation', { name: en.workspace_label });
  await expect(bar).toBeVisible();
  return bar;
}

/** Signs in as someone new, and signs out again, giving the user id they were given. */
async function aUser(page: Page, name: string): Promise<string> {
  const bar = await signInAs(page, name);
  const handle = (await bar.getByRole('link', { name: /^Your profile/ }).textContent())?.trim() ?? '';
  await bar.getByRole('link', { name: /^Your profile/ }).click();
  await page.getByRole('button', { name: en.sign_out }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
  return handle;
}

test.describe('the admin pages, for anyone but an admin', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] });

  test('are not found, and not offered', async ({ page }, info) => {
    const bar = await signInAs(page, nameFor('carol', info));
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

  const bar = await signInAs(page, E2E_ADMIN);
  await bar.getByRole('link', { name: en.admin_link, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.admin_users_heading })).toBeVisible();
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill(handle);
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: handle, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: handle })).toBeVisible();

  // Viewing the site as them: the banner says so on every page, and what is changed is recorded as the admin's.
  await page.getByRole('button', { name: en.admin_impersonate_button }).click();
  const banner = page.getByRole('status').filter({ hasText: en.impersonation_banner.replace('{name}', handle) });
  await expect(banner).toBeVisible();
  await page
    .getByRole('navigation', { name: en.workspace_label })
    .getByRole('link', { name: /^Your profile/ })
    .click();
  await page.getByRole('textbox', { name: en.nickname_label }).fill(nickname);
  await page.getByRole('button', { name: en.nickname_save }).click();
  await expect(page.getByRole('status').filter({ hasText: en.nickname_saved })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: en.impersonation_banner.split('{name}')[0] ?? '' }),
  ).toBeVisible();
  await page.getByRole('button', { name: en.impersonation_stop }).click();

  // Back as the admin, on the user's page, which lists what was done.
  await expect(page.getByRole('heading', { level: 1, name: nickname })).toBeVisible();
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
  await page
    .getByRole('navigation', { name: en.workspace_label })
    .getByRole('link', { name: /^Your profile/ })
    .click();
  await page.getByRole('button', { name: en.sign_out }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
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
  const bar = await signInAs(page, E2E_ADMIN);
  await bar.getByRole('link', { name: en.admin_link, exact: true }).click();
  await page.getByRole('searchbox', { name: en.admin_search_label }).fill('e2e-admin-handle');
  await page.getByRole('button', { name: en.admin_search_button }).click();
  await page.getByRole('table').getByRole('link', { name: 'e2e-admin-handle', exact: true }).click();
  await expect(page.getByText(en.admin_self)).toBeVisible();
  await expect(page.getByRole('button', { name: en.admin_ban_button })).toHaveCount(0);
  await expect(page.getByRole('button', { name: en.admin_impersonate_button })).toHaveCount(0);
});
