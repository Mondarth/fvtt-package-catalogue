<script lang="ts">
  import EndpointList from '#lib/components/EndpointList.svelte';
  import { ENDPOINTS } from '#lib/endpoints.js';
  import { m } from '#lib/paraglide/messages.js';
</script>

<h1>{m.site_title()}</h1>
<p class="lede">{m.home_lede()}</p>

<EndpointList endpoints={ENDPOINTS} />

<style>
  .lede {
    color: var(--muted);
  }
</style>
