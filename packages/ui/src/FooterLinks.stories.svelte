<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import FooterLinks from './FooterLinks.svelte';

  /** The links at the foot of every page, the same on every Mondarth site: the Terms, and what is stored. */
  const { Story } = defineMeta({
    title: 'Layout/FooterLinks',
    component: FooterLinks,
    tags: ['autodocs'],
    args: {
      links: [
        { href: '#terms', label: 'Terms' },
        { href: '#privacy', label: 'What we store' },
      ],
    },
  });
</script>

<Story
  name="Terms and privacy"
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '#terms');
    await expect(canvas.getByRole('link', { name: 'What we store' })).toHaveAttribute('href', '#privacy');
  }} />
