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

  /**
   * Whether the open menu hangs from its button, just below it, lined up with the button's end (as at the far right of
   * the bar) or, where that would run it off the window, with its start; and whole, on the window.
   */
  async function hangsFromItsButton(canvasElement: HTMLElement): Promise<void> {
    const button = canvasElement.querySelector('summary')?.getBoundingClientRect() ?? new DOMRect();
    const menu = canvasElement.querySelector('.items')?.getBoundingClientRect() ?? new DOMRect(-100);
    const lined = Math.min(Math.abs(menu.right - button.right), Math.abs(menu.left - button.left));
    await expect(lined).toBeLessThan(1);
    await expect(menu.top).toBeGreaterThanOrEqual(button.bottom);
    await expect(menu.top - button.bottom).toBeLessThan(16);
    await expect(menu.left).toBeGreaterThanOrEqual(0);
    await expect(menu.right).toBeLessThanOrEqual(window.innerWidth);
  }

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
    await hangsFromItsButton(canvasElement);
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
  play={async ({ canvas, canvasElement, userEvent }) => {
    // Escape with the focus outside the menu closes it, and leaves the focus where it was.
    await userEvent.click(canvas.getByText('Ulenar'));
    await expect(canvas.getByRole('link', { name: 'Admin' })).toBeVisible();
    // On its own, out of the bar, the menu hangs from its button still.
    await hangsFromItsButton(canvasElement);
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

<Story
  name="At the far right, as in the bar"
  args={{ account: { name: 'Ulenar', label: 'Your profile, Ulenar', items: ITEMS } }}
  play={async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByText('Ulenar'));
    await hangsFromItsButton(canvasElement);
    // From the button's end: there is the room, leftwards.
    const button = canvasElement.querySelector('summary')?.getBoundingClientRect() ?? new DOMRect();
    const menu = canvasElement.querySelector('.items')?.getBoundingClientRect() ?? new DOMRect();
    await expect(Math.abs(menu.right - button.right)).toBeLessThan(1);
  }}>
  {#snippet template(args)}
    <div style="display:flex;justify-content:flex-end"><UserMenu {...args} /></div>
  {/snippet}
</Story>
