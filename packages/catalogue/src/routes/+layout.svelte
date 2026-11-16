<script lang="ts">
  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import Logo from '#lib/components/Logo.svelte';
  import MachineTranslationNotice from '#lib/components/MachineTranslationNotice.svelte';
  import TopBar from '#lib/components/TopBar.svelte';
  import { m } from '#lib/paraglide/messages.js';

  import type { LayoutProps } from './$types';

  let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta name="description" content={m.site_description()} />
</svelte:head>

<header>
  <a class="home" href={resolve('/')}><Logo height="2rem" alt={m.home_link()} /></a>
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
