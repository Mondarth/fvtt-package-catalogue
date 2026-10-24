<script lang="ts">
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import MachineTranslationNotice from '#lib/components/MachineTranslationNotice.svelte';
  import { m } from '#lib/paraglide/messages.js';

  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta name="description" content={m.site_description()} />
</svelte:head>

<header>
  <LanguagePicker />
</header>

<main>
  <MachineTranslationNotice />
  {@render children()}
</main>

<style>
  :global(:root) {
    --bg: #fdfcfa;
    --fg: #1d1b18;
    --muted: #5f5a52;
    --accent: #8a3b12;
    --note-bg: #f6efe6;
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #161513;
      --fg: #ece8e1;
      --muted: #a9a297;
      --accent: #f0a46f;
      --note-bg: #26221d;
    }
  }

  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: system-ui, sans-serif;
    line-height: 1.5;
  }

  header,
  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1rem;
  }

  header {
    display: flex;
    justify-content: flex-end;
    padding-block: 1rem 0;
  }

  main {
    padding-block: 1rem 2rem;
  }
</style>
