<!--
  A page meant to be read, such as the Terms or what is stored: its text kept to a readable width (the tokens'
  `layout.content`), in the middle of the application's full-width frame.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The text. */
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="prose">{@render children()}</div>

<style>
  .prose {
    max-width: var(--mdr-layout-content);
    margin-inline: auto;
  }
</style>
