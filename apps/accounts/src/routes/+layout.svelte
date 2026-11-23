<script lang="ts">
  // Mondarth's theme, which every application shares.
  import '@mondarth/ui/theme.css';
  import { Logo } from '@mondarth/ui';
  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import MachineTranslationNotice from '#lib/components/MachineTranslationNotice.svelte';
  import { setDateLocale } from '@mondarth/ui/dates';
  import { m } from '#lib/paraglide/messages.js';

  import type { LayoutProps } from './$types';

  let { children, data }: LayoutProps = $props();

  // Every date below is written as the reader writes them.
  setDateLocale(() => data.dateLocale);
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta name="description" content={m.site_description()} />
</svelte:head>

<header>
  <a class="home" href={resolve('/')}><Logo height="2rem" alt={m.home_link()} /></a>
  <LanguagePicker />
</header>

<main>
  <MachineTranslationNotice />
  {@render children()}
</main>

<style>
  header,
  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1rem;
  }

  header {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
    padding-block: 1rem 0;
  }

  main {
    padding-block: 1rem 2rem;
  }
</style>
