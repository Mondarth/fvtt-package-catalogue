<script lang="ts">
  import { CALLERS } from '#lib/endpoints.js';

  import type { Endpoint } from '#lib/endpoints.js';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    endpoints: readonly Endpoint[];
  }

  let { endpoints }: Props = $props();
</script>

<section aria-labelledby="endpoints-heading">
  <h2 id="endpoints-heading">{m.endpoints_heading()}</h2>
  {#if endpoints.length === 0}
    <p>{m.endpoints_none()}</p>
  {:else}
    <ul>
      {#each endpoints as { method, path, summary, callers } (`${method} ${path}`)}
        <li>
          <code><span class="method">{method}</span> {path}</code>
          <span>{summary()}</span>
          <span class="callers">{CALLERS[callers]()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  ul {
    display: grid;
    gap: var(--mdr-space-3);
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: var(--mdr-space-1);
  }

  code {
    font-family: var(--mdr-font-family-mono);
    overflow-wrap: anywhere;
  }

  .callers {
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }

  .method {
    color: var(--mdr-color-accent);
    font-weight: var(--mdr-font-weight-strong);
  }
</style>
