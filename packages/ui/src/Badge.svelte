<!--
  A badge: a word or two of state beside what it is about, such as "Introductory" or "Disputed". Its tone is a colour
  of the theme; its words say what it means, as colour alone never does.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Its colour, by what it means. */
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
    children: Snippet;
  }

  let { tone = 'neutral', children }: Props = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
  .badge {
    --tone: var(--mdr-color-text-muted);

    display: inline-block;
    padding: 0 var(--mdr-space-2);
    border: var(--mdr-border-width-thin) solid var(--tone);
    border-radius: var(--mdr-radius-pill);
    background: var(--mdr-color-subtle);
    color: var(--tone);
    font-size: var(--mdr-font-size-small);
    font-weight: var(--mdr-font-weight-strong);
    line-height: var(--mdr-font-line-height-body);
    white-space: nowrap;
  }

  .accent {
    --tone: var(--mdr-color-accent);
  }

  .success {
    --tone: var(--mdr-color-success);
  }

  .warning {
    --tone: var(--mdr-color-warning);
  }

  .danger {
    --tone: var(--mdr-color-danger);
  }

  .info {
    --tone: var(--mdr-color-info);
  }
</style>
