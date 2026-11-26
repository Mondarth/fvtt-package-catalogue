<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';
  import TopBar from './TopBar.svelte';

  /**
   * The bar along the top of every page: the application's links, if it has any, what it puts beside them, such as the
   * language picker, and, at the far right, the user navigation menu (Navigation/UserMenu).
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
</script>

<Story
  name="Signed out"
  play={async ({ canvas }) => {
    const bar = canvas.getByRole('navigation', { name: 'Workspace' });
    // The user menu at the far right: here, the way to sign in or register.
    await expect(bar.lastElementChild).toBe(canvas.getByRole('link', { name: 'Sign in/register' }));
  }} />

<Story
  name="Signed in, with links and a language picker"
  args={{
    links: [{ href: '#packages', label: 'Packages' }],
    account: {
      name: 'Ulenar',
      label: 'Your profile, Ulenar',
      items: [
        { href: '#profile', label: 'Profile' },
        { action: '#sign-out', label: 'Sign out' },
      ],
    },
  }}
  play={async ({ canvas }) => {
    const bar = canvas.getByRole('navigation', { name: 'Workspace' });
    await expect(canvas.getByRole('link', { name: 'Packages' })).toHaveAttribute('href', '#packages');
    await expect(bar).toHaveTextContent('English');
    await expect(bar.lastElementChild).toBe(canvas.getByText('Ulenar').closest('details'));
  }}>
  {#snippet template(args)}
    <TopBar {...withoutChildren(args)}><span>English</span></TopBar>
  {/snippet}
</Story>
