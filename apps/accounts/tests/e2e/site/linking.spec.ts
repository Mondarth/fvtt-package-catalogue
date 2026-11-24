import { FAKE_PROVIDER_URL } from '../environment.js';
import { expect, test } from '../fixtures.js';
import { messagesOf } from '../messages.js';

import type { Page, TestInfo } from '@playwright/test';

const en = messagesOf('en');

/** A user's name with the providers, unique to the test and the browser. */
const nameFor = (who: string, info: TestInfo) =>
  `${who}-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;

/** Signs in through a stand-in provider, as a user it knows by name. */
async function signInWith(page: Page, name: string, provider: string) {
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('button', { name: en.sign_in_with.replace('{provider}', provider) }).click();
}

/** The handle of the profile signed in to. */
async function handleOf(page: Page) {
  await page.goto('/profile');
  return (await page.locator('code').first().textContent())?.trim() ?? '';
}

async function signOut(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: en.sign_out, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
}

// Regression: signing in with Google or Discord by the email address of a profile made with GitHub was refused as
// account_not_linked.
test('signing in with another provider, by an address both verified, signs in to the same profile', async ({
  page,
}, info) => {
  const name = nameFor('two', info);
  // The test provider gives `<name>@example.test`, verified.
  await signInWith(page, name, 'Test provider');
  await expect(page.getByRole('navigation', { name: en.workspace_label })).toBeVisible();
  const handle = await handleOf(page);
  await signOut(page);

  await page.request.get(`${FAKE_PROVIDER_URL}/patreon-email/${name}?email=${name}@example.test&verified=true`);
  await signInWith(page, name, 'Patreon');
  await expect(page.getByRole('navigation', { name: en.workspace_label })).toBeVisible();
  expect(await handleOf(page)).toBe(handle);
});

test.describe('by an address the other provider has not verified', () => {
  // Firefox reports a page chunk whose loading is cut off, as the refused sign-in's page is left, as an error.
  test.use({ allowedConsoleErrors: [/^error loading dynamically imported module: /] });

  test('signing in is refused, and the profile is left as it was', async ({ page }, info) => {
    const name = nameFor('unproved', info);
    await signInWith(page, name, 'Test provider');
    await expect(page.getByRole('navigation', { name: en.workspace_label })).toBeVisible();
    const handle = await handleOf(page);
    await signOut(page);

    await page.request.get(`${FAKE_PROVIDER_URL}/patreon-email/${name}?email=${name}@example.test&verified=false`);
    await signInWith(page, name, 'Patreon');
    await expect(page).toHaveURL(/[?&]error=/);
    await expect(page.getByRole('navigation', { name: en.workspace_label })).toHaveCount(0);

    // The profile is theirs still, by the provider they made it with, and has no Patreon.
    await signInWith(page, name, 'Test provider');
    expect(await handleOf(page)).toBe(handle);
  });
});
