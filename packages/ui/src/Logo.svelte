<!--
  A Mondarth website's logo: the crescent and the gear, around the site's emblem. The same in either colour scheme, as
  its colours read on both. Its width follows its height.
-->
<script lang="ts">
  import accounts from '@mondarth/design-tokens/brand/accounts.svg';
  import aide from '@mondarth/design-tokens/brand/aide.svg';
  import catalogue from '@mondarth/design-tokens/brand/catalogue.svg';
  import mondarth from '@mondarth/design-tokens/brand/mondarth.svg';

  /** Each site's logo, by the name the design tokens give it (`data-site`). */
  const LOGOS = { mondarth, catalogue, aide, accounts };

  interface Props {
    /** Its height, in CSS units; its width follows. */
    height: string;
    /** Whose logo: mondarth.com's unless given. */
    site?: keyof typeof LOGOS;
    /** What it says to a screen reader; nothing, where the page says it already. */
    alt?: string;
  }

  let { height, site = 'mondarth', alt = '' }: Props = $props();
</script>

<img src={LOGOS[site]} {alt} style:height />

<style>
  img {
    display: block;
    width: auto;
  }
</style>
