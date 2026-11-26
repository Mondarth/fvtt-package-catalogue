<!--
  A field: its label, the control the page gives it, a hint, and the problem with what was entered, each tied to the
  control as a screen reader needs (`for`, `aria-describedby`, `aria-invalid`). The page renders its own control, a
  native one, so that its form posts as the page's form would, and spreads `field` onto it.
-->
<script module lang="ts">
  /** What the field gives its control. */
  export interface FieldControl {
    readonly id: string;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The control's id, which the label names. */
    id: string;
    /** What the field is. */
    label: string;
    /** What helps to fill it in. */
    hint?: string | undefined;
    /** What is wrong with what was entered, if anything. */
    problem?: string | undefined;
    /** The control, given what ties it to the field. */
    children: Snippet<[FieldControl]>;
  }

  let { id, label, hint, problem, children }: Props = $props();

  const hintId = $derived(`${id}-hint`);
  const problemId = $derived(`${id}-problem`);
  const field: FieldControl = $derived({
    id,
    'aria-describedby':
      [hint === undefined ? undefined : hintId, problem === undefined ? undefined : problemId]
        .filter(Boolean)
        .join(' ') || undefined,
    'aria-invalid': problem !== undefined,
  });
</script>

<div class="field" class:invalid={problem !== undefined}>
  <label for={id}>{label}</label>
  {@render children(field)}
  {#if hint !== undefined}<p class="hint" id={hintId}>{hint}</p>{/if}
  {#if problem !== undefined}<p class="problem" id={problemId}>{problem}</p>{/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--mdr-space-1);
    justify-items: start;
  }

  label {
    font-weight: var(--mdr-font-weight-strong);
  }

  .field :global(:is(input, select, textarea)) {
    max-width: 100%;
    padding: var(--mdr-space-2) var(--mdr-space-3);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border-strong);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
    color: var(--mdr-color-text);
    font: inherit;
  }

  .field :global(:is(input, select, textarea):focus-visible) {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 1px;
  }

  .invalid :global(:is(input, select, textarea)) {
    border-color: var(--mdr-color-danger);
  }

  .hint,
  .problem {
    margin: 0;
    font-size: var(--mdr-font-size-small);
  }

  .hint {
    color: var(--mdr-color-text-muted);
  }

  .problem {
    color: var(--mdr-color-danger);
    font-weight: var(--mdr-font-weight-strong);
  }
</style>
