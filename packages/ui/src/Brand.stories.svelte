<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Brand from './Brand.svelte';

  /**
   * A Mondarth website's brand, linking home: its logo, and "Mondarth" over the site's own name, each in its colour as
   * text, readable in either theme.
   */
  const { Story } = defineMeta({
    title: 'Brand/Brand',
    component: Brand,
    tags: ['autodocs'],
    args: { href: '#home', site: 'accounts', name: 'Accounts', label: 'Mondarth Accounts: home' },
    argTypes: { site: { control: 'select', options: ['mondarth', 'catalogue', 'aide', 'accounts'] } },
  });
</script>

<Story
  name="Accounts"
  play={async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Mondarth Accounts: home' });
    await expect(link).toHaveAttribute('href', '#home');
    await expect(link).toHaveTextContent(/Mondarth\s*Accounts/);
    // Its colours its own site's, wherever it is.
    await expect(link).toHaveAttribute('data-site', 'accounts');
    const [mondarth, site] = [canvas.getByText('Mondarth'), canvas.getByText('Accounts')].map(
      element => getComputedStyle(element).color,
    );
    await expect(mondarth).not.toBe(site);
  }} />

<Story name="Catalogue" args={{ site: 'catalogue', name: 'Catalogue', label: 'Mondarth Catalogue: home' }} />

<Story name="AIDE" args={{ site: 'aide', name: 'AIDE', label: 'Mondarth AIDE: home' }} />
