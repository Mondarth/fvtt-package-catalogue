<!--
  The links at the foot of every page, the same on every Mondarth site: the Terms, and what is stored. Each site gives
  their addresses and words; they wrap onto more lines on a narrow page.
-->
<script lang="ts">
  interface Props {
    /** The links, in order. */
    links: readonly { readonly href: string; readonly label: string }[];
  }

  let { links }: Props = $props();
</script>

<ul class="links">
  {#each links as link (link.href)}
    <li><a href={link.href}>{link.label}</a></li>
  {/each}
</ul>

<style>
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2) var(--mdr-space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
