<!-- The top bar, with something beside its menu, or nothing. -->
<script lang="ts">
  import TopBar from '../../src/TopBar.svelte';

  import type { TopBarLink } from '../../src/top-bar.js';

  let { links, beside }: { links: readonly TopBarLink[]; beside: boolean } = $props();
</script>

{#if beside}
  <TopBar label="Workspace" {links} name="Ulenar" profileHref="/profile" profileLabel="Profile: Ulenar">
    <span>Beside</span>
  </TopBar>
{:else}
  <TopBar label="Workspace" {links} name="Ulenar" profileHref="/profile" profileLabel="Profile: Ulenar" />
{/if}
