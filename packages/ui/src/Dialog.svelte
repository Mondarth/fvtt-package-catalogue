<!--
  A modal dialog: the native one, which keeps the focus inside it, closes on Escape, and gives the focus back to what
  opened it. Open it by setting `open`; it sets `open` to false however it is closed.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Whether it is open. */
    open?: boolean;
    /** Its title, which names it. */
    title: string;
    /** What it says. */
    children: Snippet;
    /** Its buttons, at its foot. */
    actions?: Snippet;
  }

  let { open = $bindable(false), title, children, actions }: Props = $props();
  const titleId = $props.id();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (open && dialog?.open === false) dialog.showModal();
    else if (!open && dialog?.open === true) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  onclose={() => {
    // The event comes a moment after the dialog closes: by then it may be open again, as when reopened at once, and
    // a stale close is not to shut it.
    if (dialog?.open === false) open = false;
  }}>
  <h2 id={titleId}>{title}</h2>
  <div class="body">{@render children()}</div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</dialog>

<style>
  dialog {
    width: min(var(--mdr-layout-dialog), calc(100vw - 2 * var(--mdr-space-4)));
    padding: var(--mdr-space-5);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
    color: var(--mdr-color-text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }

  h2 {
    margin: 0 0 var(--mdr-space-3);
    font-size: var(--mdr-font-size-large);
    line-height: var(--mdr-font-line-height-tight);
  }

  .body {
    display: grid;
    gap: var(--mdr-space-3);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2);
    margin-top: var(--mdr-space-5);
  }
</style>
