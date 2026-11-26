<!--
  A table of data: the page writes its rows and columns; this sets them out, and lets a wide one scroll sideways in
  its own box rather than the page. Its caption names it, shown or for screen readers alone.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** What the table is. */
    caption: string;
    /** Whether the caption is for screen readers alone, as where a heading says it already. */
    hideCaption?: boolean;
    /** Its `<thead>` and `<tbody>`. */
    children: Snippet;
  }

  let { caption, hideCaption = false, children }: Props = $props();
</script>

<!--
  A wide table scrolls in its own box, which a keyboard must reach to scroll it (axe's scrollable-region-focusable): in
  the tab order, and named as the table is. A group, not a region: a landmark of the same name as the section it is in,
  as where a heading names both, would be one a screen reader lists twice.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" role="group" aria-label={caption} tabindex="0">
  <table>
    <caption class:mdr-visually-hidden={hideCaption}>{caption}</caption>
    {@render children()}
  </table>
</div>

<style>
  .scroll {
    max-width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--mdr-font-size-small);
    font-variant-numeric: tabular-nums;
  }

  caption {
    padding-block-end: var(--mdr-space-2);
    color: var(--mdr-color-text-muted);
    text-align: start;
  }

  table :global(th),
  table :global(td) {
    padding: var(--mdr-space-2) var(--mdr-space-3);
    border-bottom: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    text-align: start;
    vertical-align: top;
  }

  table :global(thead th) {
    background: var(--mdr-color-subtle);
    font-weight: var(--mdr-font-weight-strong);
    white-space: nowrap;
  }
</style>
