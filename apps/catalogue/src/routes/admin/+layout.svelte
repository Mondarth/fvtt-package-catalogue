<!--
  The admin pages' frame: their own menu, above each page.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { m } from '#lib/paraglide/messages.js';

  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const LINKS = [
    { href: '/admin/users', label: m.admin_nav_users },
    { href: '/admin/subscriptions', label: m.admin_nav_subscriptions },
    { href: '/admin/audit', label: m.admin_nav_audit },
  ] as const;
</script>

<nav aria-label={m.admin_nav_label()}>
  <ul>
    {#each LINKS as link (link.href)}
      <li>
        <a href={resolve(link.href)} aria-current={page.url.pathname.startsWith(link.href) ? 'page' : undefined}
          >{link.label()}</a>
      </li>
    {/each}
  </ul>
</nav>

{@render children()}

<style>
  ul {
    display: flex;
    gap: 1.5rem;
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
  }

  a {
    color: var(--accent);
  }

  a[aria-current='page'] {
    font-weight: bold;
    text-decoration: none;
  }
</style>
