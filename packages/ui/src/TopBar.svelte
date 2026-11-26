<!--
  The bar along the top of every page: the application's menu, if it has one, then whatever it puts beside it, such as
  the language picker, and, at the far right, the user navigation menu (`UserMenu`): the way to sign in or register,
  or, once signed in, the user's own menu.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import UserMenu from './UserMenu.svelte';

  import type { TopBarAccount, TopBarLink } from './top-bar.js';

  interface Props {
    /** What the bar is labelled, as a landmark. */
    label: string;
    /** The menu's links, if the application has any beside the user menu. */
    links?: readonly TopBarLink[];
    /** The signed-in user, and their menu; none while signed out. */
    account: TopBarAccount | null;
    /** Where to sign in or register while signed out, and what the link says. */
    signIn: TopBarLink;
    /** What goes between the menu and the user menu, such as the language picker. */
    children?: Snippet;
  }

  let { label, links = [], account, signIn, children }: Props = $props();
</script>

<nav aria-label={label}>
  <ul class="menu">
    {#each links as link (link.href)}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
  {@render children?.()}
  <UserMenu {account} {signIn} />
</nav>

<style>
  nav {
    display: flex;
    gap: var(--mdr-space-4);
    align-items: center;
  }

  .menu {
    flex: 1;
    display: flex;
    gap: var(--mdr-space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .menu a {
    color: var(--mdr-color-accent);
  }
</style>
