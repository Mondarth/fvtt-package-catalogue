<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, waitFor } from 'storybook/test';

  import UserMenu from './UserMenu.svelte';

  /**
   * The user navigation menu, shared by every Mondarth website: while signed out, the way to sign in or register; once
   * signed in, the button showing the user's name, which opens their menu. Each application gives the entries, in its
   * own words: links, or actions posted as forms, such as signing out.
   */
  const { Story } = defineMeta({
    title: 'Navigation/UserMenu',
    component: UserMenu,
    tags: ['autodocs'],
    args: { signIn: { href: '#sign-in', label: 'Sign in/register' }, account: null },
  });

  const ITEMS = [
    { href: '#profile', label: 'Profile' },
    { href: '#subscription', label: 'Subscription' },
    { href: '#admin', label: 'Admin' },
    { action: '#sign-out', label: 'Sign out' },
  ];
</script>

<Story
  name="Signed out"
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Sign in/register' })).toHaveAttribute('href', '#sign-in');
  }} />

<Story
  name="Signed in"
  args={{ account: { name: 'Ulenar', label: 'Your profile, Ulenar', items: ITEMS } }}
  play={async ({ canvas, canvasElement, userEvent }) => {
    const button = canvas.getByText('Ulenar');
    await expect(button).toHaveAccessibleName('Your profile, Ulenar');
    await expect(canvas.queryByRole('link', { name: 'Sign in/register' })).toBeNull();
    // Closed until its button is pressed; then its entries, signing out a form posted, not a link.
    await expect(canvas.getByRole('link', { name: 'Profile', hidden: true })).not.toBeVisible();
    await userEvent.click(button);
    await expect(canvas.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#profile');
    const signOut = canvas.getByRole('button', { name: 'Sign out' });
    await expect(signOut.closest('form')).toHaveAttribute('method', 'POST');
    await expect(signOut.closest('form')).toHaveAttribute('action', '#sign-out');
    // Every entry, hovered, fills the menu and no more.
    const menu = canvasElement.querySelector('.items')?.getBoundingClientRect();
    for (const name of ['Profile', 'Subscription', 'Admin']) {
      const entry = canvas.getByRole('link', { name });
      await userEvent.hover(entry);
      const box = entry.getBoundingClientRect();
      await expect(box.left).toBeGreaterThanOrEqual((menu?.left ?? 0) - 0.5);
      await expect(box.right).toBeLessThanOrEqual((menu?.right ?? 0) + 0.5);
    }
    await expect(signOut.getBoundingClientRect().right).toBeLessThanOrEqual((menu?.right ?? 0) + 0.5);
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
  name="Escape from outside the menu"
  args={{ account: { name: 'Ulenar', label: 'Your profile, Ulenar', items: ITEMS } }}
  play={async ({ canvas, userEvent }) => {
    // Escape with the focus outside the menu closes it, and leaves the focus where it was.
    await userEvent.click(canvas.getByText('Ulenar'));
    await expect(canvas.getByRole('link', { name: 'Admin' })).toBeVisible();
    canvas.getByRole('link', { name: 'Elsewhere' }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Admin', hidden: true })).not.toBeVisible());
    await expect(canvas.getByRole('link', { name: 'Elsewhere' })).toHaveFocus();
  }}>
  {#snippet template(args)}
    <p><a href="#elsewhere">Elsewhere</a></p>
    <UserMenu {...args} />
  {/snippet}
</Story>
