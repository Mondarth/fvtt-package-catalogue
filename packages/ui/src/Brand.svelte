<!--
  A Mondarth website's brand, at the left of its header, linking home: its logo, and beside it its name on two lines,
  "Mondarth" in Mondarth's colour over the site's own name in the site's colour, each as text readable in either theme
  (the design tokens' `color.site-text`). It marks itself with its site, so that its colours are its own wherever it is.
-->
<script lang="ts">
  import Logo from './Logo.svelte';

  interface Props {
    /** Where its link goes: the site's home. */
    href: string;
    /** Which site it is: its logo, and its colour. */
    site: 'mondarth' | 'catalogue' | 'aide' | 'accounts';
    /** The site's own name, under "Mondarth", in the page's language. */
    name: string;
    /** What the link says to a screen reader: its visible words, and where it goes, such as "Mondarth Accounts: home". */
    label: string;
  }

  let { href, site, name, label }: Props = $props();
</script>

<a class="brand" {href} aria-label={label} data-site={site}>
  <Logo {site} height="2.5rem" />
  <span class="name">
    <span class="mondarth">Mondarth</span>
    <span class="site">{name}</span>
  </span>
</a>

<style>
  .brand {
    display: inline-flex;
    flex: none;
    gap: var(--mdr-space-2);
    align-items: center;
    text-decoration: none;
  }

  .name {
    display: grid;
    line-height: var(--mdr-font-line-height-tight);
  }

  .mondarth {
    color: var(--mdr-color-site-text-mondarth);
    font-size: var(--mdr-font-size-large);
    font-weight: var(--mdr-font-weight-strong);
  }

  .site {
    color: var(--mdr-color-site-text);
    font-size: var(--mdr-font-size-small);
    font-weight: var(--mdr-font-weight-strong);
  }

  .brand:hover .name,
  .brand:focus-visible .name {
    text-decoration: underline;
  }
</style>
