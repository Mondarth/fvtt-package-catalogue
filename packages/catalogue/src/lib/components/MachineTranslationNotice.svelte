<script lang="ts">
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
  <p class="notice" role="note">{m.machine_translation_notice()}</p>
{/if}

<style>
  .notice {
    margin: 0 0 1.5rem;
    padding: 0.75rem 1rem;
    border-inline-start: 4px solid var(--accent);
    background: var(--note-bg);
  }
</style>
