<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, waitFor } from 'storybook/test';

  import TopBar from './TopBar.svelte';

  /**
   * The bar along the top of every page: while signed out, the way to sign in or register; signed in, the button
   * showing the user's name, which opens their menu (their profile, their subscription, the admin pages for an admin,
   * and signing out).
   */
  const { Story } = defineMeta({
    title: 'Navigation/TopBar',
    component: TopBar,
    tags: ['autodocs'],
    args: {
      label: 'Workspace',
      signIn: { href: '#sign-in', label: 'Sign in/register' },
      account: null,
    },
  });

  const ITEMS = [
    { href: '#profile', label: 'Profile' },
    { href: '#subscription', label: 'Subscription' },
    { action: '#sign-out', label: 'Sign out' },
  ];
</script>

<Story
  name="Signed out"
  play={async ({ canvas }) => {
    const bar = canvas.getByRole('navigation', { name: 'Workspace' });
    const signIn = canvas.getByRole('link', { name: 'Sign in/register' });
    await expect(signIn).toHaveAttribute('href', '#sign-in');
    await expect(bar.lastElementChild).toBe(signIn);
    await expect(canvas.queryByRole('group')).toBeNull();
  }} />

<Story
  name="Signed in"
  args={{ account: { name: 'Ulenar', label: 'Your profile, Ulenar', items: ITEMS } }}
  play={async ({ canvas, userEvent }) => {
    const button = canvas.getByText('Ulenar');
    await expect(button).toHaveAccessibleName('Your profile, Ulenar');
    await expect(canvas.queryByRole('link', { name: 'Sign in/register' })).toBeNull();
    // Closed until its button is pressed; then its entries, signing out a form posted, not a link.
    await expect(canvas.getByRole('link', { name: 'Profile', hidden: true })).not.toBeVisible();
    await userEvent.click(button);
    await expect(canvas.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#profile');
    await expect(canvas.getByRole('link', { name: 'Subscription' })).toBeVisible();
    const signOut = canvas.getByRole('button', { name: 'Sign out' });
    await expect(signOut.closest('form')).toHaveAttribute('method', 'POST');
    await expect(signOut.closest('form')).toHaveAttribute('action', '#sign-out');
    // Escape closes it, the focus back on its button; so does a click anywhere else.
    canvas.getByRole('link', { name: 'Profile' }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Profile', hidden: true })).not.toBeVisible());
    await expect(button).toHaveFocus();
    await userEvent.click(button);
    await expect(canvas.getByRole('link', { name: 'Profile' })).toBeVisible();
    await userEvent.click(document.body);
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Profile', hidden: true })).not.toBeVisible());
    // Escape, closed, changes nothing.
    await userEvent.keyboard('{Escape}');
    await expect(button).not.toHaveFocus();
  }} />

<Story
  name="An admin, with a language picker beside"
  args={{
    links: [{ href: '#packages', label: 'Packages' }],
    account: {
      name: 'Ulenar',
      label: 'Your profile, Ulenar',
      items: [...ITEMS.slice(0, 2), { href: '#admin', label: 'Admin' }, ...ITEMS.slice(2)],
    },
  }}
  play={async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('navigation', { name: 'Workspace' })).toHaveTextContent('English');
    await expect(canvas.getByRole('link', { name: 'Packages' })).toHaveAttribute('href', '#packages');
    // Escape with the focus outside the menu closes it, and leaves the focus where it was.
    await userEvent.click(canvas.getByText('Ulenar'));
    await expect(canvas.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '#admin');
    canvas.getByRole('link', { name: 'Packages' }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Admin', hidden: true })).not.toBeVisible());
    await expect(canvas.getByRole('link', { name: 'Packages' })).toHaveFocus();
  }}>
  {#snippet template(args)}
    <TopBar {...args}><span>English</span></TopBar>
  {/snippet}
</Story>
