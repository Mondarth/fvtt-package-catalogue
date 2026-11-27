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
    { href: '/admin/eligibilities', label: m.admin_nav_eligibilities },
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
    flex-wrap: wrap;
    gap: var(--mdr-space-5);
    margin: 0 0 var(--mdr-space-4);
    padding: 0;
    list-style: none;
  }

  a[aria-current='page'] {
    font-weight: var(--mdr-font-weight-strong);
    text-decoration: none;
  }
</style>
