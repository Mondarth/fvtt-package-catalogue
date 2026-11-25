<script lang="ts">
  // Mondarth's theme, which every application shares.
  import '@mondarth/ui/theme.css';
  import { Logo } from '@mondarth/ui';
  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import MachineTranslationNotice from '#lib/components/MachineTranslationNotice.svelte';
  import TopBar from '#lib/components/TopBar.svelte';
  import { setDateLocale } from '#lib/dates.js';
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
  <a class="home" href={resolve('/')}><Logo site="accounts" height="2rem" alt={m.home_link()} /></a>
  {#if data.signedIn === null}
    <LanguagePicker />
  {:else}
    <TopBar name={data.signedIn.name} admin={data.signedIn.admin} />
  {/if}
</header>

{#if data.signedIn?.impersonated === true}
  <!-- On every page while an admin views the site as someone, so that it is never forgotten. -->
  <div class="impersonating" role="status">
    <span>{m.impersonation_banner({ name: data.signedIn.name })}</span>
    <form method="POST" action="/impersonation/stop">
      <button type="submit">{m.impersonation_stop()}</button>
    </form>
  </div>
{/if}

<main>
  <MachineTranslationNotice />
  {@render children()}
</main>

<footer>
  <a href={resolve('/terms')}>{m.terms_link()}</a>
  <a href={resolve('/privacy')}>{m.privacy_link()}</a>
</footer>

<style>
  header,
  main,
  footer {
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

  .home {
    flex: none;
  }

  header > :global(nav) {
    flex: 1;
  }

  main {
    padding-block: 1rem 2rem;
  }

  footer {
    display: flex;
    gap: 1.5rem;
    padding-block: 1rem 2rem;
    border-top: 1px solid var(--muted);
    font-size: 0.9rem;
  }

  .impersonating {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    background: var(--accent);
    color: var(--bg);
  }

  .impersonating form {
    margin: 0;
  }

  .impersonating button {
    padding: 0.2rem 0.8rem;
    font: inherit;
    cursor: pointer;
  }
</style>
