<!--
  A button: `primary` for the one main action of a view (the gear's gold), `secondary` for the rest, `danger` for what
  cannot be undone. A native button, so that it submits a form as the page's form would; whatever else it is given
  (`name`, `value`, `formaction`, `aria-*`) it passes on.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    /** What kind of action it is. */
    variant?: 'primary' | 'secondary' | 'danger';
    children: Snippet;
  }

  let { variant = 'secondary', type = 'button', children, ...rest }: Props = $props();
</script>

<button {...rest} {type} class="button {variant}">{@render children()}</button>

<style>
  .button {
    display: inline-flex;
    gap: var(--mdr-space-2);
    align-items: center;
    justify-content: center;
    padding: var(--mdr-space-2) var(--mdr-space-4);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border-strong);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
    color: var(--mdr-color-text);
    font: inherit;
    font-weight: var(--mdr-font-weight-strong);
    line-height: var(--mdr-font-line-height-tight);
    cursor: pointer;
  }

  .button:hover {
    border-color: var(--mdr-color-accent);
  }

  .button:focus-visible {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 2px;
  }

  .primary {
    border-color: var(--mdr-color-action);
    background: var(--mdr-color-action);
    color: var(--mdr-color-text-on-action);
  }

  .primary:hover {
    border-color: var(--mdr-color-text);
  }

  .danger {
    border-color: var(--mdr-color-danger);
    color: var(--mdr-color-danger);
  }

  .danger:hover {
    border-color: var(--mdr-color-danger);
    background: var(--mdr-color-subtle);
  }

  .button:disabled {
    border-color: var(--mdr-color-border);
    background: var(--mdr-color-subtle);
    color: var(--mdr-color-text-muted);
    cursor: not-allowed;
  }
</style>
