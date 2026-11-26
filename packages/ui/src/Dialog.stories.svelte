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
  let again = $state(false);
</script>

<Story
  name="Asking before a refund"
  play={async ({ canvas, userEvent }) => {
    const opener = canvas.getByRole('button', { name: 'Cancel and ask for a refund' });
    await userEvent.click(opener);
    const dialog = await canvas.findByRole('dialog', { name: 'Cancel this purchase?' });
    await expect(dialog).toHaveTextContent('£2.40 for the 20 days not yet used');
    // Closing it gives the focus back to what opened it. (Escape closes it too: the browser's own, which synthetic
    // key events do not reach.) The close event comes a moment after: waited for, so that the dialog has taken it.
    const closed = new Promise(resolve => {
      dialog.addEventListener('close', resolve, { once: true });
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Keep it' }));
    await closed;
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

<Story
  name="Reopened at once"
  play={async ({ canvas, userEvent }) => {
    const opener = canvas.getByRole('button', { name: 'Open the details' });
    await userEvent.click(opener);
    await canvas.findByRole('dialog', { name: 'Details' });
    // Closed and opened again before the close event comes: the event, late, does not shut it again. The clicks are
    // the elements' own, a microtask apart, which lets the dialog close and reopen while the close event, a task of its
    // own, can only come after both.
    canvas.getByRole('button', { name: 'Close' }).click();
    await Promise.resolve();
    opener.click();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 100));
    await expect(canvas.getByRole('dialog', { name: 'Details' })).toBeVisible();
  }}>
  {#snippet template()}
    <Button onclick={() => (again = true)}>Open the details</Button>
    <Dialog bind:open={again} title="Details">
      <p>Bought on 20 November 2026, for a month.</p>
      {#snippet actions()}<Button onclick={() => (again = false)}>Close</Button>{/snippet}
    </Dialog>
  {/snippet}
</Story>
