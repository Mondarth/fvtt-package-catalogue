<!--
  A note set apart from the text around it, announced as a note, not an alert: by default, as at the top of a page that
  was translated by machine, in the accent. Wherever it is, it may say what it is for, in the colour the tokens give
  that purpose (note, tip, important, warning or caution), and with an icon for it. The words are the application's.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  /** What a notice is for. */
  type NoticeType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

  interface Props {
    /** What it is for, which colours it; none, and it is in the accent, as a plain note. */
    type?: NoticeType | undefined;
    /** Whether it shows an icon for what it is for; a plain note's is a note's. */
    icon?: boolean;
    children: Snippet;
  }

  let { type, icon = false, children }: Props = $props();

  /**
   * Each purpose's icon, drawn as mondarth.com's are, in strokes on a 24 by 24 grid: a circled `i`, a light bulb, a
   * speech bubble with `!`, a triangle with `!`, an octagon with `!`.
   */
  const ICONS: Readonly<Record<NoticeType, string>> = {
    note: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v5 M12 8h.01',
    tip: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z',
    important: 'M4 4h16v12H8l-4 4z M12 7v4 M12 14h.01',
    warning: 'M12 3 2 20h20z M12 10v4 M12 17h.01',
    caution: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 8v4 M12 16h.01',
  };
</script>

<div class={['notice', type !== undefined && `notice-${type}`, { 'notice-with-icon': icon }]} role="note">
  {#if icon}
    <svg
      class="notice-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      data-icon={type ?? 'note'}><path d={ICONS[type ?? 'note']} /></svg>
  {/if}
  <div class="notice-body">{@render children()}</div>
</div>

<style>
  .notice {
    --notice-colour: var(--mdr-color-accent);
    margin: 0 0 var(--mdr-space-5);
    padding: var(--mdr-space-3) var(--mdr-space-4);
    border-inline-start: var(--mdr-border-width-rule) solid var(--notice-colour);
    background: var(--mdr-color-subtle);
  }

  /* Each purpose in its status colour, light or dark with the page, its background a breath of the same. */
  .notice-note {
    --notice-colour: var(--mdr-color-info);
  }

  .notice-tip {
    --notice-colour: var(--mdr-color-success);
  }

  .notice-important {
    --notice-colour: var(--mdr-color-accent);
  }

  .notice-warning {
    --notice-colour: var(--mdr-color-warning);
  }

  .notice-caution {
    --notice-colour: var(--mdr-color-danger);
  }

  .notice-note,
  .notice-tip,
  .notice-important,
  .notice-warning,
  .notice-caution {
    background: color-mix(in srgb, var(--notice-colour) 8%, var(--mdr-color-subtle));
  }

  .notice-with-icon {
    display: flex;
    gap: var(--mdr-space-3);
    align-items: flex-start;
  }

  .notice-icon {
    flex: none;
    margin-block-start: 0.15em;
    color: var(--notice-colour);
  }

  .notice-body {
    min-width: 0;
  }

  .notice-body > :global(:first-child) {
    margin-block-start: 0;
  }

  .notice-body > :global(:last-child) {
    margin-block-end: 0;
  }
</style>
