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
    margin-block: 0.5rem;
    padding: 0.6rem 0.9rem;
    border-left: 4px solid var(--accent);
    background: var(--note-bg);
    color: var(--fg);
    font-weight: 600;
  }

  .callout:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
