<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Logo from './Logo.svelte';

  /**
   * A Mondarth website's logo: the crescent and the gear around its emblem. One image in both themes, as its colours
   * read on both; its width follows its height.
   */
  const { Story } = defineMeta({
    title: 'Brand/Logo',
    component: Logo,
    tags: ['autodocs'],
    args: { height: '6rem' },
    argTypes: {
      site: { control: 'select', options: ['mondarth', 'catalogue', 'aide', 'accounts'] },
    },
  });
</script>

<Story
  name="mondarth.com"
  args={{ alt: 'Mondarth' }}
  play={async ({ canvas }) => {
    const logo = canvas.getByRole('img', { name: 'Mondarth' });
    await expect(logo.getAttribute('src')).toMatch(/svg/);
    await expect(logo.style.height).toBe('6rem');
  }} />

<Story name="Catalogue" args={{ site: 'catalogue', alt: 'Catalogue' }} />

<Story name="AIDE" args={{ site: 'aide', alt: 'AIDE' }} />

<Story
  name="Accounts"
  args={{ site: 'accounts', alt: 'Accounts' }}
  play={async ({ canvas }) => {
    const accounts = canvas.getByRole('img', { name: 'Accounts' }).getAttribute('src') ?? '';
    await expect(accounts).toMatch(/svg/);
    await expect(decodeURIComponent(accounts)).toMatch(/Accounts|accounts/);
  }} />

<Story
  name="Beside a name that says it already"
  args={{ height: '2rem' }}
  play={async ({ canvasElement }) => {
    // Unnamed, it is nothing to a screen reader.
    await expect(canvasElement.querySelector('img')).toHaveAttribute('alt', '');
  }} />
