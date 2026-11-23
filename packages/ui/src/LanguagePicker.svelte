<!--
  The language picker: every language the application is in, each named in itself, the one the page is in chosen.
-->
<script lang="ts" generics="L extends string">
  import { languageName } from './language.js';

  interface Props {
    /** What the picker is labelled, in the page's language. */
    label: string;
    /** The languages the application is in. */
    locales: readonly L[];
    /** The one the page is in. */
    current: L;
    /** Switches to another language. */
    choose: (locale: L) => void;
  }

  let { label, locales, current, choose }: Props = $props();

  const isLocale = (value: string): value is L => locales.some(locale => locale === value);

  function onchange(event: Event & { currentTarget: HTMLSelectElement }): void {
    const { value } = event.currentTarget;
    if (isLocale(value) && value !== current) choose(value);
  }
</script>

<label>
  <span>{label}</span>
  <select value={current} {onchange}>
    {#each locales as locale (locale)}
      <option value={locale} lang={locale}>{languageName(locale)}</option>
    {/each}
  </select>
</label>

<style>
  label {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--muted);
  }

  select {
    font: inherit;
  }
</style>
