<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Callout from './Callout.svelte';

  /**
   * A problem with what was just done, beside the form it is about: announced as an alert, and taking the focus, which
   * scrolls it into view.
   */
  const { Story } = defineMeta({
    title: 'Feedback/Callout',
    component: Callout,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Default"
  play={async ({ canvas }) => {
    const alert = canvas.getByRole('alert');
    await expect(alert).toHaveTextContent('Tick the box to agree to the terms, then buy.');
    await expect(alert).toHaveAttribute('id', 'buy-problem');
    await expect(alert).toHaveFocus();
  }}>
  {#snippet template()}
    <Callout id="buy-problem">Tick the box to agree to the terms, then buy.</Callout>
  {/snippet}
</Story>
