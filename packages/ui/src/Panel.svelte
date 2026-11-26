<!--
  A panel: a section of a page set apart on a surface, named by its heading, so that it is a landmark a screen reader
  can go to. Use it for what needs setting apart, not for every block.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Its heading, which names it. */
    heading: string;
    /** The heading's level, under the page's title. */
    level?: 2 | 3;
    children: Snippet;
  }

  let { heading, level = 2, children }: Props = $props();
  const headingId = $props.id();
</script>

<section class="panel" aria-labelledby={headingId}>
  <svelte:element this={`h${String(level)}`} id={headingId}>{heading}</svelte:element>
  {@render children()}
</section>

<style>
  .panel {
    display: grid;
    gap: var(--mdr-space-3);
    padding: var(--mdr-space-4) var(--mdr-space-5);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
  }

  .panel > :global(h2),
  .panel > :global(h3) {
    margin: 0;
    font-size: var(--mdr-font-size-large);
    line-height: var(--mdr-font-line-height-tight);
  }
</style>
