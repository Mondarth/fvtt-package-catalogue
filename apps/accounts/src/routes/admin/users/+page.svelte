<!--
  The admin pages' list of users: found by a search, the newest first, a page at a time.
-->
<script lang="ts">
  import { Badge, Button, Field, Table } from '@mondarth/ui';

  import { resolve } from '$app/paths';
  import { useDates } from '#lib/dates.js';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const { date } = useDates();
</script>

<svelte:head>
  <title>{m.admin_users_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.admin_users_heading()}</h1>

<form method="GET" role="search">
  <Field id="q" label={m.admin_search_label()} hint={m.admin_search_hint()}>
    {#snippet children(field)}
      <div class="inline">
        <input {...field} name="q" type="search" value={data.search} />
        <Button type="submit">{m.admin_search_button()}</Button>
      </div>
    {/snippet}
  </Field>
</form>

<p role="status">{m.admin_users_count({ total: data.total })}</p>

{#if data.users.length === 0}
  <p>{m.admin_users_none()}</p>
{:else}
  <Table caption={m.admin_users_heading()} hideCaption>
    <thead>
      <tr>
        <th scope="col">{m.admin_column_user()}</th>
        <th scope="col">{m.admin_column_email()}</th>
        <th scope="col">{m.admin_column_role()}</th>
        <th scope="col">{m.admin_column_joined()}</th>
      </tr>
    </thead>
    <tbody>
      {#each data.users as user (user.id)}
        <tr>
          <th scope="row">
            <a href={resolve('/admin/users/[id]', { id: user.id })}>{user.nickname ?? user.handle}</a>
            {#if user.nickname !== null}<span class="hint">{user.handle}</span>{/if}
          </th>
          <td>{user.email}</td>
          <td>
            {user.admin ? m.admin_role_admin() : m.admin_role_user()}
            {#if user.banned}<Badge tone="danger">{m.admin_banned()}</Badge>{/if}
          </td>
          <td>{date(user.createdAt)}</td>
        </tr>
      {/each}
    </tbody>
  </Table>
{/if}

{#if data.pages > 1}
  <!-- Each a form, as the search is, keeping it. -->
  <nav class="pages" aria-label={m.admin_page_of({ page: data.page, pages: data.pages })}>
    {#if data.page > 1}
      <form method="GET">
        {#if data.search !== ''}<input type="hidden" name="q" value={data.search} />{/if}
        <Button type="submit" name="page" value={data.page - 1}>{m.admin_page_previous()}</Button>
      </form>
    {/if}
    <span>{m.admin_page_of({ page: data.page, pages: data.pages })}</span>
    {#if data.page < data.pages}
      <form method="GET">
        {#if data.search !== ''}<input type="hidden" name="q" value={data.search} />{/if}
        <Button type="submit" name="page" value={data.page + 1}>{m.admin_page_next()}</Button>
      </form>
    {/if}
  </nav>
{/if}

<style>
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2);
  }

  .inline input {
    flex: 1 1 14rem;
  }

  .hint {
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }

  th[scope='row'] {
    font-weight: var(--mdr-font-weight-regular);
  }

  /* A user's id under their nickname, in the same cell. */
  th[scope='row'] .hint {
    display: block;
  }

  td,
  th {
    overflow-wrap: break-word;
  }

  .pages {
    display: flex;
    gap: var(--mdr-space-4);
    align-items: center;
    margin-top: var(--mdr-space-4);
  }
</style>
