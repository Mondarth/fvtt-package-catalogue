<script lang="ts">
  // Mondarth's theme, which every application shares.
  import '@mondarth/ui/theme.css';
  import { AppShell, Logo } from '@mondarth/ui';
  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
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

<AppShell skipLabel={m.skip_link()}>
  {#snippet header()}
    <a class="home" href={resolve('/')}><Logo site="catalogue" height="2rem" alt={m.home_link()} /></a>
    {#if data.signedIn === null}
      <LanguagePicker />
    {:else}
      <div class="bar">
        <TopBar name={data.signedIn.name} admin={data.signedIn.admin} accounts={data.accountsSite} />
      </div>
    {/if}
  {/snippet}

  {#if data.signedIn?.impersonated === true}
    <!-- At the top of every page while an admin views the site as someone, so that it is never forgotten: stopped at
      the accounts. -->
    <div class="impersonating" role="status">
      <span>{m.impersonation_banner({ name: data.signedIn.name })}</span>
      <a href={data.accountsSite} rel="external">{m.impersonation_stop_at_accounts()}</a>
    </div>
  {/if}
  <MachineTranslationNotice />
  {@render children()}
</AppShell>

<style>
  .home {
    flex: none;
  }

  /* The top bar takes the header's width, its profile button at the far right. */
  .bar {
    flex: 1;
  }

  .impersonating {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2) var(--mdr-space-4);
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--mdr-space-5);
    padding: var(--mdr-space-3) var(--mdr-space-4);
    border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-warning);
    background: var(--mdr-color-subtle);
  }
</style>
