<!--
  The home page: what the catalogue is, its API, what is stored and the Terms. Signing in is the bar's, at the top of
  every page.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<h1>{m.site_title()}</h1>
<p class="lede">{m.home_lede()}</p>

<ul class="links">
  <li><a href={resolve('/developers')}>{m.developers_link()}</a></li>
  <li><a href={`${data.accountsSite}/privacy`} rel="external">{m.privacy_link()}</a></li>
  <li><a href={`${data.accountsSite}/terms`} rel="external">{m.terms_link()}</a></li>
</ul>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }

  .links {
    display: grid;
    gap: var(--mdr-space-2);
    padding: 0;
    list-style: none;
  }
</style>
