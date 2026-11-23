<script lang="ts">
  import { languageName, locales, type Locale } from '#lib/i18n.js';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js';

  interface Props {
    /** The locale the page is in. */
    current?: Locale;
    /** Switches to a locale; by default, sets the locale's cookie and reloads the page in it. */
    choose?: (locale: Locale) => void;
  }

  let { current = getLocale(), choose = locale => void setLocale(locale) }: Props = $props();

  const isLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

  function onchange(event: Event & { currentTarget: HTMLSelectElement }): void {
    const { value } = event.currentTarget;
    if (isLocale(value) && value !== current) choose(value);
  }
</script>

<label>
  <span>{m.language_label()}</span>
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
