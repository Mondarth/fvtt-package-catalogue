<!-- The language picker, in the catalogue's languages, switching by Paraglide's cookie. -->
<script lang="ts">
  import { LanguagePicker } from '@mondarth/ui';

  import { locales, type Locale } from '#lib/i18n.js';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js';

  interface Props {
    /** The locale the page is in. */
    current?: Locale;
    /** Switches to a locale; by default, sets the locale's cookie and reloads the page in it. */
    choose?: (locale: Locale) => void;
  }

  let { current = getLocale(), choose = locale => void setLocale(locale) }: Props = $props();
</script>

<LanguagePicker label={m.language_label()} {locales} {current} {choose} />
