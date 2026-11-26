<!--
  The bar along the top of every page: the application's menu, if it has one, then whatever it puts beside it, such as
  the language picker, and, at the far right, the way to sign in or register, or, once signed in, the button showing
  the name the user is shown by, which opens their menu: their profile, their subscription, and the like, and signing
  out.

  The menu is a disclosure (`<details>`), which opens without a script; with one, Escape closes it and gives the focus
  back to its button, and so does a click anywhere else.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { isAction } from './top-bar.js';

  import type { TopBarAccount, TopBarLink } from './top-bar.js';

  interface Props {
    /** What the bar is labelled, as a landmark. */
    label: string;
    /** The menu's links, if the application has any beside the profile menu. */
    links?: readonly TopBarLink[];
    /** The signed-in user, and their menu; none while signed out. */
    account: TopBarAccount | null;
    /** Where to sign in or register while signed out, and what the link says. */
    signIn: TopBarLink;
    /** What goes between the menu and the profile button, such as the language picker. */
    children?: Snippet;
  }

  let { label, links = [], account, signIn, children }: Props = $props();

  let open = $state(false);
  let details: HTMLDetailsElement | undefined = $state();

  /** Closes the menu, giving the focus back to its button where it was within the menu. */
  function close(refocus: boolean): void {
    open = false;
    if (refocus) details?.querySelector('summary')?.focus();
  }

  $effect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(details?.contains(document.activeElement) === true);
    };
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || details?.contains(event.target) !== true) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  });
</script>

<nav aria-label={label}>
  <ul class="menu">
    {#each links as link (link.href)}
      <li><a href={link.href}>{link.label}</a></li>
    {/each}
  </ul>
  {@render children?.()}
  {#if account === null}
    <a class="sign-in" href={signIn.href}>{signIn.label}</a>
  {:else}
    <details class="account" bind:this={details} bind:open>
      <summary class="profile" aria-label={account.label}>{account.name}</summary>
      <ul class="items">
        {#each account.items as item (item.label)}
          <li>
            {#if isAction(item)}
              <form method="POST" action={item.action}><button type="submit">{item.label}</button></form>
            {:else}
              <a href={item.href}>{item.label}</a>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
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

  .profile,
  .sign-in {
    display: inline-flex;
    gap: var(--mdr-space-2);
    align-items: center;
    padding: var(--mdr-space-1) var(--mdr-space-3);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border-strong);
    border-radius: var(--mdr-radius-pill);
    color: var(--mdr-color-text);
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .profile:hover,
  .profile:focus-visible,
  .sign-in:hover,
  .sign-in:focus-visible {
    border-color: var(--mdr-color-accent);
    color: var(--mdr-color-accent);
  }

  .profile:focus-visible,
  .sign-in:focus-visible {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: 2px;
  }

  /* The way in, for a visitor: the main action of the bar, in the gear's gold. */
  .sign-in {
    border-color: var(--mdr-color-action);
    background: var(--mdr-color-action);
    color: var(--mdr-color-text-on-action);
    font-weight: var(--mdr-font-weight-strong);
  }

  .sign-in:hover,
  .sign-in:focus-visible {
    border-color: var(--mdr-color-text);
    color: var(--mdr-color-text-on-action);
  }

  .account {
    position: relative;
  }

  /* The button's own marker gives way to the dot and a caret. */
  .profile {
    list-style: none;
  }

  .profile::-webkit-details-marker {
    display: none;
  }

  .profile::before {
    content: '';
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--mdr-color-accent);
  }

  .profile::after {
    content: '▾';
    font-size: var(--mdr-font-size-small);
  }

  .account[open] .profile::after {
    content: '▴';
  }

  .items {
    position: absolute;
    inset-inline-end: 0;
    z-index: 10;
    display: grid;
    min-width: 12rem;
    margin: var(--mdr-space-1) 0 0;
    padding: var(--mdr-space-1) 0;
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
    list-style: none;
  }

  .items a,
  .items button {
    display: block;
    width: 100%;
    padding: var(--mdr-space-2) var(--mdr-space-4);
    border: 0;
    background: none;
    color: var(--mdr-color-text);
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .items a:hover,
  .items a:focus-visible,
  .items button:hover,
  .items button:focus-visible {
    background: var(--mdr-color-subtle);
    color: var(--mdr-color-accent);
  }

  .items form {
    margin: 0;
  }

  .menu a {
    color: var(--mdr-color-accent);
  }
</style>
