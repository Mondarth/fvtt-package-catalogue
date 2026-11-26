<!--
  A note at the top of a page, such as that it was translated by machine: set apart, and announced as a note, not an
  alert.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<p class="notice" role="note">{@render children()}</p>

<style>
  .notice {
    margin: 0 0 var(--mdr-space-5);
    padding: var(--mdr-space-3) var(--mdr-space-4);
    border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-accent);
    background: var(--mdr-color-subtle);
  }
</style>
