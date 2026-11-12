import { FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');

/** A user's name with the provider, unique to the test and the browser, as every browser runs every test at once. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/** A handle, as handles.ts makes them. */
const HANDLE = /^[a-z]+-[a-z]+-[a-z]+-\d\d$/;

/**
 * Signs in through the stand-in provider, as a user it knows by name.
 *
 * @returns The profile button the workspace shows
 */
async function signInAs(page: Page, name: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }).click();
  await expect(page.getByRole('navigation', { name: en.workspace_label })).toBeVisible();
  return page.getByRole('navigation', { name: en.workspace_label }).getByRole('link');
}

test('signing in makes a profile with a random user id, shown at the far right of the workspace', async ({
  page,
}, info) => {
  const profile = await signInAs(page, nameFor('alice', info));
  await expect(profile).toHaveText(HANDLE);

  await profile.click();
  await expect(page.getByRole('heading', { level: 1, name: en.profile_heading })).toBeVisible();
  const handle = (await profile.textContent())?.trim() ?? '';
  await expect(page.locator('code')).toHaveText(handle);
  // What is stored, as the provider gave it.
  const stored = page.getByRole('region', { name: en.profile_stored_heading });
  await expect(stored).toContainText(/@example\.test/);
  await expect(stored).toContainText('Test provider');
  await expect(stored.getByRole('link', { name: en.privacy_link })).toBeVisible();
});

test.describe('a nickname', () => {
  // The browser reports the form's 400, for a nickname taken, as an error.
  test.use({ allowedConsoleErrors: [/status of 400/] });

  test('is shown in place of the user id, once set, and someone else cannot take it', async ({ page }, info) => {
    const nickname = `Nick ${info.project.name} ${String(Date.now()).slice(-6)}`;
    let profile = await signInAs(page, nameFor('bob', info));
    await profile.click();
    await page.getByRole('textbox', { name: en.nickname_label }).fill(nickname);
    await page.getByRole('button', { name: en.nickname_save }).click();
    await expect(page.getByRole('status')).toHaveText(en.nickname_saved);
    await expect(profile).toHaveText(nickname);

    await page.getByRole('button', { name: en.sign_out }).click();
    await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();

    profile = await signInAs(page, nameFor('carol', info));
    await profile.click();
    await page.getByRole('textbox', { name: en.nickname_label }).fill(nickname.toUpperCase());
    await page.getByRole('button', { name: en.nickname_save }).click();
    await expect(page.getByRole('alert')).toHaveText(en.nickname_problem_taken);
    await expect(profile).toHaveText(HANDLE);
  });
});

test('signing out ends the session', async ({ page }, info) => {
  const profile = await signInAs(page, nameFor('dave', info));
  await profile.click();
  await page.getByRole('button', { name: en.sign_out }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
});

test('deleting the profile removes it, once the box is ticked: signing in again makes a new one', async ({
  page,
}, info) => {
  const name = nameFor('erin', info);
  const profile = await signInAs(page, name);
  const handle = (await profile.textContent())?.trim() ?? '';
  await profile.click();

  const deletion = page.getByRole('region', { name: en.delete_heading });
  await deletion.getByRole('checkbox', { name: en.delete_confirm }).check();
  await deletion.getByRole('button', { name: en.delete_button }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();

  const again = await signInAs(page, name);
  await expect(again).toHaveText(HANDLE);
  await expect(again).not.toHaveText(handle);
});
