<!-- Says a page in a language translated by machine was translated by machine. -->
<script lang="ts">
  import { Notice } from '@mondarth/ui';

  import { isMachineTranslated, type Locale } from '#lib/i18n.js';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';

  interface Props {
    /** The locale the page is in. */
    locale?: Locale;
  }

  let { locale = getLocale() }: Props = $props();
</script>

{#if isMachineTranslated(locale)}
  <Notice>{m.machine_translation_notice()}</Notice>
{/if}
