<script lang="ts">
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
      {#each endpoints as { method, path, summary } (`${method} ${path}`)}
        <li>
          <code><span class="method">{method}</span> {path}</code>
          <span>{summary()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  li {
    display: grid;
    gap: 0.25rem;
  }

  code {
    overflow-wrap: anywhere;
  }

  .method {
    font-weight: 700;
    color: var(--accent);
  }
</style>
