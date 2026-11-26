<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import AppShell from './AppShell.svelte';
  import FooterLinks from './FooterLinks.svelte';
  import Logo from './Logo.svelte';
  import TopBar from './TopBar.svelte';

  /**
   * The frame of every page: a link to skip to the content, the header, the page in its main landmark, and the
   * footer. It takes the window's whole width, with a gutter that grows with it; a page meant to be read keeps its
   * text to a readable width with `Prose`.
   */
  const { Story } = defineMeta({
    title: 'Layout/AppShell',
    component: AppShell,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
    args: { skipLabel: 'Skip to the content' },
  });
</script>

<Story
  name="Signed in"
  play={async ({ canvas, userEvent }) => {
    // The skip link is the first thing a keyboard reaches, and goes to the page.
    await userEvent.tab();
    const skip = canvas.getByRole('link', { name: 'Skip to the content' });
    await expect(skip).toHaveFocus();
    await expect(skip).toHaveAttribute('href', '#main');
    await expect(canvas.getByRole('main')).toHaveTextContent('Subscribed until 25 December 2026');
    await expect(canvas.getByRole('banner')).toContainElement(canvas.getByRole('navigation', { name: 'Workspace' }));
    await expect(canvas.getByRole('contentinfo')).toHaveTextContent('What we store, and why');
  }}>
  {#snippet template(args)}
    <AppShell {...withoutChildren(args)}>
      {#snippet header()}
        <a href="#home" aria-label="Home"><Logo site="accounts" height="2rem" /></a>
        <div style="flex:1">
          <TopBar
            label="Workspace"
            signIn={{ href: '#sign-in', label: 'Sign in/register' }}
            account={{
              name: 'Ulenar',
              label: 'Your profile, Ulenar',
              items: [
                { href: '#profile', label: 'Profile' },
                { href: '#subscription', label: 'Subscription' },
                { action: '#sign-out', label: 'Sign out' },
              ],
            }} />
        </div>
      {/snippet}
      <h1>Subscription</h1>
      <p>Subscribed until 25 December 2026.</p>
      {#snippet footer()}
        <FooterLinks
          links={[
            { href: '#terms', label: 'Terms' },
            { href: '#privacy', label: 'What we store, and why' },
          ]} />
      {/snippet}
    </AppShell>
  {/snippet}
</Story>

<Story
  name="Without a footer"
  play={async ({ canvas }) => {
    await expect(canvas.queryByRole('contentinfo')).toBeNull();
  }}>
  {#snippet template(args)}
    <AppShell {...withoutChildren(args)}>
      {#snippet header()}<Logo site="catalogue" height="2rem" alt="Catalogue" />{/snippet}
      <h1>Sign in</h1>
    </AppShell>
  {/snippet}
</Story>
