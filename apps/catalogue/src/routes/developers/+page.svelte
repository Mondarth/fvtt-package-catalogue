<script lang="ts">
  import { Prose } from '@mondarth/ui';

  import EndpointList from '#lib/components/EndpointList.svelte';
  import { ENDPOINTS } from '#lib/endpoints.js';
  import { m } from '#lib/paraglide/messages.js';
</script>

<!-- A page meant to be read: its text kept to a readable width. -->
<Prose>
  <h1>{m.developers_heading()}</h1>
  <p class="lede">{m.home_lede()}</p>
  <p>{m.developers_auth()}</p>

  <EndpointList endpoints={ENDPOINTS} />
</Prose>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }
</style>
