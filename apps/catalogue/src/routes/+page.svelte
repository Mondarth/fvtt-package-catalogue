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
</ul>

<style>
  .lede {
    color: var(--muted);
  }

  .sign-in {
    display: inline-block;
    padding: 0.4rem 1rem;
    border: 1px solid var(--accent);
    border-radius: 999px;
    color: var(--accent);
    text-decoration: none;
  }

  .links {
    padding: 0;
    list-style: none;
  }
</style>
