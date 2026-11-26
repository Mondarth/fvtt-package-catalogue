import { readFileSync } from 'node:fs';

import { expect, test } from '../fixtures.js';
import { ACCOUNTS_URL, E2E_URL, FAKE_PROVIDER_URL } from '../environment.js';
import { messagesOf } from '../messages.js';

import type accountsEn from '../../../../accounts/messages/en.json';

const en = messagesOf('en');
const accounts = JSON.parse(
  readFileSync(new URL('../../../../accounts/messages/en.json', import.meta.url), 'utf8'),
) as typeof accountsEn;

test('signing in at the accounts, from the catalogue, comes back to it signed in, and signing out there ends it', async ({
  page,
}, info) => {
  const name = `sso-${info.project.name}-${String(info.workerIndex)}-${String(Date.now())}`;
  await page.goto(`${FAKE_PROVIDER_URL}/as/${name}`);
  await page.goto('/');
  await page.getByRole('link', { name: en.sign_in_register }).click();
  await expect(page).toHaveURL(new RegExp(`^${ACCOUNTS_URL}/`));
  await page.getByRole('button', { name: accounts.sign_in_with.replace('{provider}', 'Test provider') }).click();

  // Back at the catalogue, which the accounts' one session cookie signs in to.
  await expect(page).toHaveURL(`${E2E_URL}/`);
  const bar = page.getByRole('navigation', { name: en.workspace_label });
  await expect(bar).toBeVisible();
  await expect(page.getByRole('link', { name: en.sign_in_register })).toHaveCount(0);
  // The profile menu: the accounts' pages.
  await bar.getByLabel(/^Your profile, /).click();
  await expect(bar.getByRole('link', { name: en.profile_link })).toHaveAttribute('href', `${ACCOUNTS_URL}/profile`);
  await expect(bar.getByRole('link', { name: en.subscription_link })).toHaveAttribute(
    'href',
    `${ACCOUNTS_URL}/subscription`,
  );

  // Signing in again from the catalogue, already signed in, comes straight back.
  await page.goto(`${ACCOUNTS_URL}/?next=${encodeURIComponent(`${E2E_URL}/developers`)}`);
  await expect(page).toHaveURL(`${E2E_URL}/developers`);

  // Signing out at the catalogue, through the accounts' internal API, signs out of both.
  await bar.getByLabel(/^Your profile, /).click();
  await bar.getByRole('button', { name: en.sign_out }).click();
  await expect(page).toHaveURL(`${E2E_URL}/`);
  await expect(page.getByRole('link', { name: en.sign_in_register })).toBeVisible();
  await page.goto(`${ACCOUNTS_URL}/profile`);
  await expect(page.getByRole('heading', { level: 1, name: accounts.sign_in_heading })).toBeVisible();
});
