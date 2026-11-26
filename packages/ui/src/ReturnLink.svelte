<!--
  The way back to another Mondarth website, for a visitor who came from one: its logo and "Back to …", in the site's
  colour as text, so that they know at once where it goes. It marks itself with its site, so that its colours are its
  own wherever it is.
-->
<script lang="ts">
  import Logo from './Logo.svelte';

  interface Props {
    /** Where it goes. */
    href: string;
    /** Which site it goes back to. */
    site: 'mondarth' | 'catalogue' | 'aide' | 'accounts';
    /** What it says, such as "Back to the Catalogue". */
    label: string;
  }

  let { href, site, label }: Props = $props();
</script>

<a class="return" {href} data-site={site}>
  <span class="arrow" aria-hidden="true">←</span>
  <Logo {site} height="1.5rem" />
  <span>{label}</span>
</a>

<style>
  .return {
    display: inline-flex;
    gap: var(--mdr-space-2);
    align-items: center;
    padding: var(--mdr-space-1) var(--mdr-space-3) var(--mdr-space-1) var(--mdr-space-2);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border-strong);
    border-radius: var(--mdr-radius-pill);
    color: var(--mdr-color-site-text);
    font-weight: var(--mdr-font-weight-strong);
    text-decoration: none;
  }

  .return:hover,
  .return:focus-visible {
    border-color: var(--mdr-color-site-text);
  }

  .return:focus-visible {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 2px;
  }
</style>
