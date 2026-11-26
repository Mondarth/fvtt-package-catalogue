<!--
  The way back to the Mondarth application the visitor came from, if they came from one: the shared link, in this
  site's words, through `/return`, which forgets the way back kept with their session as they take it.
-->
<script lang="ts">
  import { ReturnLink } from '@mondarth/ui';

  import { resolve } from '$app/paths';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The way back: the page, and which of Mondarth's applications it is; none, and there is no link. */
    to?: { readonly url: string; readonly site: 'mondarth' | 'catalogue' | 'aide' } | null | undefined;
  }

  let { to }: Props = $props();

  const LABELS = { mondarth: m.return_mondarth, catalogue: m.return_catalogue, aide: m.return_aide };
</script>

{#if to}
  <ReturnLink
    href={`${resolve('/return')}?to=${encodeURIComponent(to.url)}`}
    site={to.site}
    label={LABELS[to.site]()} />
{/if}
