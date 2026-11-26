<!--
  The home page: the sign-in page, or, once signed in, the workspace, which has only its bar along the top for now.
-->
<script lang="ts">
  import SignIn from '#lib/components/SignIn.svelte';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

{#if data.signedIn === null}
  <SignIn providers={data.providers} failed={data.failed} banned={data.banned} next={data.next} />
{:else}
  <h1 class="mdr-visually-hidden">{m.workspace_label()}</h1>
{/if}
