<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import TopBar from './TopBar.svelte';

  /**
   * The bar along the top of every page while signed in: the menu, whatever the application puts beside it, and, at
   * the far right, the button to the user's profile, showing their name.
   */
  const { Story } = defineMeta({
    title: 'Navigation/TopBar',
    component: TopBar,
    tags: ['autodocs'],
    args: {
      label: 'Workspace',
      links: [
        { href: '#subscription', label: 'Subscription' },
        { href: '#keys', label: 'Keys' },
      ],
      name: 'Ulenar',
      profileHref: '#profile',
      profileLabel: 'Profile: Ulenar',
    },
  });
</script>

<Story
  name="Default"
  play={async ({ canvas }) => {
    const bar = canvas.getByRole('navigation', { name: 'Workspace' });
    await expect(canvas.getByRole('link', { name: 'Subscription' })).toHaveAttribute('href', '#subscription');
    const profile = canvas.getByRole('link', { name: 'Profile: Ulenar' });
    await expect(profile).toHaveAttribute('href', '#profile');
    await expect(profile).toHaveTextContent('Ulenar');
    await expect(bar.lastElementChild).toBe(profile);
    await expect(canvas.getAllByRole('link')).toHaveLength(3);
  }} />

<Story
  name="With something beside the menu"
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Workspace' })).toHaveTextContent('English');
  }}>
  {#snippet template(args)}
    <TopBar {...args}><span>English</span></TopBar>
  {/snippet}
</Story>
