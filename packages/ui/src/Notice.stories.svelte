<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Notice from './Notice.svelte';

  /** A note at the top of a page, such as that it was translated by machine: set apart, announced as a note. */
  const { Story } = defineMeta({
    title: 'Feedback/Notice',
    component: Notice,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Machine translation"
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('note')).toHaveTextContent('This page was translated by machine.');
    // A note, not an alert: it takes nothing from the reader.
    await expect(canvas.queryByRole('alert')).toBeNull();
  }}>
  {#snippet template()}
    <Notice>This page was translated by machine.</Notice>
  {/snippet}
</Story>
