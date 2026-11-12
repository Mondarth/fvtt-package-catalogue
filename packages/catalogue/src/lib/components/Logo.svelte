<!--
  The catalogue's logo, in the visitor's colour scheme: the light one, or the dark one where the browser prefers dark.
-->
<script lang="ts">
  import dark from '#lib/assets/brand/logo-dark.svg';
  import light from '#lib/assets/brand/logo-light.svg';

  interface Props {
    /** Its height, in CSS units; its width follows. */
    height: string;
    /** What it says to a screen reader; nothing, where the page says it already. */
    alt?: string;
  }

  let { height, alt = '' }: Props = $props();
</script>

<picture>
  <source srcset={dark} media="(prefers-color-scheme: dark)" />
  <img src={light} {alt} style:height />
</picture>

<style>
  img {
    display: block;
    width: auto;
  }
</style>
