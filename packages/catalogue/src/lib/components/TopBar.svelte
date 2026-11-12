<!--
  The workspace's bar along the top of every page while signed in: its menu, which has nothing in it yet, the language
  picker, and, at the far right, the button to the user's profile, showing the name they are shown by.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The name the user is shown by: their nickname, or else their user id. */
    name: string;
  }

  let { name }: Props = $props();
</script>

<nav aria-label={m.workspace_label()}>
  <ul class="menu"></ul>
  <LanguagePicker />
  <a class="profile" href={resolve('/profile')} aria-label={m.profile_button_label({ name })}>
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
</style>
