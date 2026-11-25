<!--
  The Terms and Conditions, in English, which governs: a page in another language says so before them.
-->
<script lang="ts">
  import Terms from '#lib/components/Terms.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
</script>

<svelte:head>
  <title>{m.terms_title()}</title>
</svelte:head>

{#if getLocale() !== 'en'}
  <p class="english" role="note">{m.terms_in_english()}</p>
{/if}

<Terms />

<style>
  .english {
    padding: 0.75rem 1rem;
    border-inline-start: 4px solid var(--accent);
    background: var(--note-bg);
  }
</style>
