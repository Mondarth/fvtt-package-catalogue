<script lang="ts">
  // Mondarth's theme, which every application shares.
  import '@mondarth/ui/theme.css';
  import { AppShell, Brand, Button } from '@mondarth/ui';
  import { resolve } from '$app/paths';
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

<AppShell skipLabel={m.skip_link()}>
  {#snippet header()}
    <Brand href={resolve('/')} site="accounts" name={m.site_name()} label={m.home_link()} />
    <div class="bar">
      <TopBar user={data.signedIn === null ? null : { name: data.signedIn.name, admin: data.signedIn.admin }} />
    </div>
  {/snippet}

  {#if data.signedIn?.impersonated === true}
    <!-- At the top of every page while an admin views the site as someone, so that it is never forgotten. -->
    <div class="impersonating" role="status">
      <span>{m.impersonation_banner({ name: data.signedIn.name })}</span>
      <form method="POST" action="/impersonation/stop">
        <Button type="submit">{m.impersonation_stop()}</Button>
      </form>
    </div>
  {/if}
  <MachineTranslationNotice />
  {@render children()}

  {#snippet footer()}
    <div class="links">
      <a href={resolve('/terms')}>{m.terms_link()}</a>
      <a href={resolve('/privacy')}>{m.privacy_link()}</a>
    </div>
  {/snippet}
</AppShell>

<style>
  /* The top bar takes the header's width, its profile button at the far right. */
  .bar {
    flex: 1;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-5);
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

  .impersonating form {
    margin: 0;
  }
</style>
