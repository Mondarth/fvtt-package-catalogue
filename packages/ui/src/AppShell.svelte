<!--
  The frame of every page: a link to skip to the page's content, the header (the logo, and the top bar once signed
  in), the page itself in its main landmark, and the footer. An application's frame takes the window's whole width,
  with a side gutter that grows with it; a page meant to be read, such as the Terms, keeps its text to a readable width
  within it (`Prose`).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The skip link's words, in the page's language. */
    skipLabel: string;
    header: Snippet;
    footer?: Snippet;
    /** The page. */
    children: Snippet;
  }

  let { skipLabel, header, footer, children }: Props = $props();
</script>

<a class="skip" href="#main">{skipLabel}</a>
<header class="frame">{@render header()}</header>
<main id="main" class="frame" tabindex="-1">{@render children()}</main>
{#if footer}<footer class="frame">{@render footer()}</footer>{/if}

<style>
  .frame {
    box-sizing: border-box;
    width: 100%;
    padding-inline: clamp(var(--mdr-space-4), 3vw, var(--mdr-space-7));
  }

  header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-4);
    align-items: center;
    padding-block: var(--mdr-space-3);
  }

  main {
    padding-block: var(--mdr-space-5) var(--mdr-space-7);
  }

  main:focus {
    outline: none;
  }

  footer {
    padding-block: var(--mdr-space-5);
    border-top: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }

  .skip {
    position: absolute;
    inset-inline-start: var(--mdr-space-4);
    top: calc(-1 * var(--mdr-space-7));
    padding: var(--mdr-space-2) var(--mdr-space-4);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-action);
    color: var(--mdr-color-text-on-action);
    font-weight: var(--mdr-font-weight-strong);
  }

  .skip:focus {
    top: var(--mdr-space-2);
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
  }
</style>
