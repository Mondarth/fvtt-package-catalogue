<!--
  A checkbox, its label beside it, and a hint below; a native one, posting `name` as the page's form would. Whatever
  else it is given (`name`, `value`, `required`, `aria-*`) it passes on.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'type' | 'children'> {
    /** Its id, which the label names. */
    id: string;
    /** Whether it is ticked. */
    checked?: boolean;
    /** What helps to decide. */
    hint?: string | undefined;
    /** The label: words, or words with a link. */
    children: Snippet;
  }

  let { id, checked = $bindable(false), hint, children, ...rest }: Props = $props();
</script>

<div class="checkbox">
  <input
    {...rest}
    {id}
    type="checkbox"
    bind:checked
    aria-describedby={hint === undefined ? rest['aria-describedby'] : `${id}-hint`} />
  <label for={id}>{@render children()}</label>
  {#if hint !== undefined}<p class="hint" id="{id}-hint">{hint}</p>{/if}
</div>

<style>
  .checkbox {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--mdr-space-1) var(--mdr-space-2);
    align-items: baseline;
  }

  input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    accent-color: var(--mdr-color-accent);
  }

  input:focus-visible {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 2px;
  }

  .hint {
    grid-column: 2;
    margin: 0;
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }
</style>
