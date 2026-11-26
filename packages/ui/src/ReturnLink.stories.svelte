<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import ReturnLink from './ReturnLink.svelte';

  /**
   * The way back to another Mondarth website, for a visitor who came from one: its logo, and where it goes, in the
   * site's colour as text.
   */
  const { Story } = defineMeta({
    title: 'Navigation/ReturnLink',
    component: ReturnLink,
    tags: ['autodocs'],
    args: { href: '#back', site: 'catalogue', label: 'Back to the Catalogue' },
    argTypes: { site: { control: 'select', options: ['mondarth', 'catalogue', 'aide', 'accounts'] } },
  });
</script>

<Story
  name="Back to the Catalogue"
  play={async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Back to the Catalogue' });
    await expect(link).toHaveAttribute('href', '#back');
    await expect(link).toHaveAttribute('data-site', 'catalogue');
  }} />

<Story name="Back to AIDE" args={{ site: 'aide', label: 'Back to AIDE' }} />

<Story name="Back to mondarth.com" args={{ site: 'mondarth', label: 'Back to mondarth.com' }} />
