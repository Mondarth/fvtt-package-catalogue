<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, waitFor } from 'storybook/test';

  import Button from './Button.svelte';
  import Dialog from './Dialog.svelte';

  /**
   * A modal dialog: it keeps the focus inside it, closes on Escape, and gives the focus back to what opened it. Ask
   * before what cannot be undone, saying what will happen.
   */
  const { Story } = defineMeta({
    title: 'Overlays/Dialog',
    component: Dialog,
    tags: ['autodocs'],
  });
</script>

<script lang="ts">
  let open = $state(false);
</script>

<Story
  name="Asking before a refund"
  play={async ({ canvas, userEvent }) => {
    const opener = canvas.getByRole('button', { name: 'Cancel and ask for a refund' });
    await userEvent.click(opener);
    const dialog = await canvas.findByRole('dialog', { name: 'Cancel this purchase?' });
    await expect(dialog).toHaveTextContent('£2.40 for the 20 days not yet used');
    // Closing it gives the focus back to what opened it. (Escape closes it too: the browser's own, which synthetic
    // key events do not reach.)
    await userEvent.click(canvas.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
    await expect(opener).toHaveFocus();
    // It opens again, as its `open` was set back.
    await userEvent.click(opener);
    await expect(await canvas.findByRole('dialog', { name: 'Cancel this purchase?' })).toBeVisible();
  }}>
  {#snippet template()}
    <Button onclick={() => (open = true)}>Cancel and ask for a refund</Button>
    <Dialog bind:open title="Cancel this purchase?">
      <p>You paid £3.00 for 30 days. You would be refunded £2.40 for the 20 days not yet used.</p>
      {#snippet actions()}
        <Button variant="danger">Cancel and refund</Button>
        <Button onclick={() => (open = false)}>Keep it</Button>
      {/snippet}
    </Dialog>
  {/snippet}
</Story>
