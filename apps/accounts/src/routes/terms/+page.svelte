<!--
  The Terms and Conditions, in English, which governs: a page in another language says so before them.
-->
<script lang="ts">
  import { Notice, Prose } from '@mondarth/ui';

  import Terms from '#lib/components/Terms.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
</script>

<svelte:head>
  <title>{m.terms_title()}</title>
</svelte:head>

<Prose>
  {#if getLocale() !== 'en'}
    <Notice>{m.terms_in_english()}</Notice>
  {/if}

  <Terms />
</Prose>
