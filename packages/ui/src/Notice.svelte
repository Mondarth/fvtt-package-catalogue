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
    margin: 0 0 1.5rem;
    padding: 0.75rem 1rem;
    border-inline-start: 4px solid var(--accent);
    background: var(--note-bg);
  }
</style>
