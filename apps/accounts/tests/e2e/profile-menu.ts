/**
 * The profile menu, at the far right of the workspace's bar, as a user uses it: its button, which shows the name they
 * are shown by, and its entries: their profile, their subscription, the admin pages for an admin, and signing out.
 */
import { expect } from './fixtures.js';
import { messagesOf } from './messages.js';

import type { Page } from '@playwright/test';

const en = messagesOf('en');

/** The workspace's bar. */
export const workspace = (page: Page) => page.getByRole('navigation', { name: en.workspace_label });

/** The button that opens the profile menu, named for the user it shows. */
export const profileButton = (page: Page) => workspace(page).getByLabel(/^Your profile, /);

/**
 * Opens the profile menu and follows one of its links.
 *
 * @param page - The page
 * @param entry - The entry, as it reads
 */
export async function choose(page: Page, entry: string): Promise<void> {
  await profileButton(page).click();
  await workspace(page).getByRole('link', { name: entry, exact: true }).click();
}

/**
 * Signs out, from the profile menu, on the profile page.
 *
 * @param page - The page
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto('/profile');
  await profileButton(page).click();
  await workspace(page).getByRole('button', { name: en.sign_out, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeVisible();
}
