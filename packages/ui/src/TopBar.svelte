<!--
  The bar along the top of every page while signed in: the application's menu, then whatever it puts beside it, such as
  the language picker, and, at the far right, the button to the user's profile, showing the name they are shown by.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { TopBarLink } from './top-bar.js';

  interface Props {
    /** What the bar is labelled, as a landmark. */
    label: string;
    /** The menu's links. */
    links: readonly TopBarLink[];
    /** The name the user is shown by. */
    name: string;
    /** Where their profile is. */
    profileHref: string;
    /** What the profile button says to a screen reader, naming them. */
    profileLabel: string;
    /** What goes between the menu and the profile button, such as the language picker. */
    children?: Snippet;
  }

  let { label, links, name, profileHref, profileLabel, children }: Props = $props();
</script>

<nav aria-label={label}>
  <ul class="menu">
    {#each links as link (link.href)}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
  {@render children?.()}
  <a class="profile" href={profileHref} aria-label={profileLabel}>
    {name}
  </a>
</nav>

<style>
  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .menu {
    flex: 1;
    display: flex;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .profile {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--muted);
    border-radius: 999px;
    color: var(--fg);
    text-decoration: none;
    white-space: nowrap;
  }

  .profile:hover,
  .profile:focus-visible {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Drawn, so that the button's text is the name alone. */
  .profile::before {
    content: '';
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .menu a {
    color: var(--accent);
  }
</style>
