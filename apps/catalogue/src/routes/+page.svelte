<!--
  The home page: what the catalogue is, its API, and, for a visitor not signed in, the way to sign in, at the accounts,
  which send them back here once signed in.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const signIn = $derived(`${data.accountsSite}/?next=${encodeURIComponent(page.url.href)}`);
</script>

<h1>{m.site_title()}</h1>
<p class="lede">{m.home_lede()}</p>

{#if data.signedIn === null}
  <p><a class="sign-in" href={signIn} rel="external">{m.sign_in_heading()}</a></p>
{/if}

<ul class="links">
  <li><a href={resolve('/developers')}>{m.developers_link()}</a></li>
  <li><a href={`${data.accountsSite}/privacy`} rel="external">{m.privacy_link()}</a></li>
  <li><a href={`${data.accountsSite}/terms`} rel="external">{m.terms_link()}</a></li>
</ul>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }

  /* A link to the accounts, not a form: drawn as the primary action it is, in the gear's gold. */
  .sign-in {
    display: inline-block;
    padding: var(--mdr-space-2) var(--mdr-space-4);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-action);
    color: var(--mdr-color-text-on-action);
    font-weight: var(--mdr-font-weight-strong);
    text-decoration: none;
  }

  .links {
    display: grid;
    gap: var(--mdr-space-2);
    padding: 0;
    list-style: none;
  }
</style>
