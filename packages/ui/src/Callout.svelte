<!--
  A problem with what was just done, beside the form it is about: it stands out, is announced as an alert, and takes
  the focus when the page shows it, which scrolls it into view, so that the eye is drawn to it wherever it is.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Its id, for the fields it is about to name it with `aria-describedby`. */
    id?: string;
    children: Snippet;
  }

  let { id, children }: Props = $props();
  let element: HTMLElement | undefined = $state();

  $effect(() => {
    element?.focus();
  });
</script>

<div bind:this={element} {id} class="callout" role="alert" tabindex="-1">
  {@render children()}
</div>

<style>
  .callout {
    margin-block: var(--mdr-space-2);
    padding: var(--mdr-space-3) var(--mdr-space-4);
    border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-accent);
    background: var(--mdr-color-subtle);
    color: var(--mdr-color-text);
    font-weight: var(--mdr-font-weight-strong);
  }

  .callout:focus {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 2px;
  }
</style>
