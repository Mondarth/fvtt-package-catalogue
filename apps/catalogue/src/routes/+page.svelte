<!--
  The home page: what the catalogue is, and its API. Signing in is the bar's, at the top of every page; the Terms and
  what is stored, the footer's, at the foot of every page.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { m } from '#lib/paraglide/messages.js';
</script>

<h1>{m.site_title()}</h1>
<p class="lede">{m.home_lede()}</p>

<p><a href={resolve('/developers')}>{m.developers_link()}</a></p>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }
</style>
