<!--
  A field: its label, the control the page gives it, a hint, and the problem with what was entered, each tied to the
  control as a screen reader needs (`for`, `aria-describedby`, `aria-invalid`), the problem announced as an alert. The
  page renders its own control, a native one, so that its form posts as the page's form would, and spreads `field` onto
  it. A required field says so apart from its hint: a mark by its label, and `required` and `aria-required` on its
  control. A wide one's control fills the field's width.
-->
<script module lang="ts">
  /** What the field gives its control. */
  export interface FieldControl {
    readonly id: string;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': boolean;
    readonly required: boolean;
    readonly 'aria-required': boolean | undefined;
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
    /** Whether it must be filled in. */
    required?: boolean;
    /** Whether its control fills its width, as in a dialog. */
    wide?: boolean;
    /** The control, given what ties it to the field. */
    children: Snippet<[FieldControl]>;
  }

  let { id, label, hint, problem, required = false, wide = false, children }: Props = $props();

  const hintId = $derived(`${id}-hint`);
  const problemId = $derived(`${id}-problem`);
  const field: FieldControl = $derived({
    id,
    'aria-describedby':
      [hint === undefined ? undefined : hintId, problem === undefined ? undefined : problemId]
        .filter(Boolean)
        .join(' ') || undefined,
    'aria-invalid': problem !== undefined,
    required,
    'aria-required': required || undefined,
  });
</script>

<div class="field" class:invalid={problem !== undefined} class:wide>
  <label for={id}
    >{label}{#if required}<span class="required" aria-hidden="true">*</span>{/if}</label>
  {@render children(field)}
  {#if hint !== undefined}<p class="hint" id={hintId}>{hint}</p>{/if}
  {#if problem !== undefined}<p class="problem" id={problemId} role="alert">{problem}</p>{/if}
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

  /* Said to a screen reader by the control's own required state, not read out. */
  .required {
    margin-inline-start: var(--mdr-space-1);
    color: var(--mdr-color-danger);
  }

  .wide {
    justify-items: stretch;
  }

  .wide :global(:is(input, select, textarea)) {
    box-sizing: border-box;
    width: 100%;
  }

  /* The control is the theme's (theme.css), its edge the danger colour while what was entered is wrong. */
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
