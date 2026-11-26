<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import Panel from './Panel.svelte';

  /** A section set apart on a surface, named by its heading, so that a screen reader can go to it. */
  const { Story } = defineMeta({
    title: 'Layout/Panel',
    component: Panel,
    tags: ['autodocs'],
    args: { heading: 'Add time to your account' },
  });
</script>

<Story
  name="Default"
  play={async ({ canvas }) => {
    const panel = canvas.getByRole('region', { name: 'Add time to your account' });
    await expect(canvas.getByRole('heading', { level: 2, name: 'Add time to your account' })).toBeInTheDocument();
    await expect(panel).toHaveTextContent('Buy a month');
  }}>
  {#snippet template(args)}
    <Panel {...withoutChildren(args)}><p>Buy a month, or a year, and your time starts as soon as you pay.</p></Panel>
  {/snippet}
</Story>

<Story
  name="Within a section"
  args={{ heading: 'Introductory offer', level: 3 }}
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'Introductory offer' })).toBeInTheDocument();
  }}>
  {#snippet template(args)}
    <h2>Subscription</h2>
    <Panel {...withoutChildren(args)}><p>Claim 7 days free, once.</p></Panel>
  {/snippet}
</Story>
