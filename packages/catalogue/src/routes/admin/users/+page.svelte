<!--
  The admin pages' list of users: found by a search, the newest first, a page at a time.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.admin_users_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.admin_users_heading()}</h1>

<form method="GET" role="search">
  <label for="q">{m.admin_search_label()}</label>
  <div class="field">
    <input id="q" name="q" type="search" value={data.search} aria-describedby="q-hint" />
    <button type="submit">{m.admin_search_button()}</button>
  </div>
  <p id="q-hint" class="hint">{m.admin_search_hint()}</p>
</form>

<p role="status">{m.admin_users_count({ total: data.total })}</p>

{#if data.users.length === 0}
  <p>{m.admin_users_none()}</p>
{:else}
  <table>
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
            {#if user.banned}<strong class="banned">{m.admin_banned()}</strong>{/if}
          </td>
          <td>{user.createdAt.toLocaleDateString(getLocale())}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if data.pages > 1}
  <!-- Each a form, as the search is, keeping it. -->
  <nav class="pages" aria-label={m.admin_page_of({ page: data.page, pages: data.pages })}>
    {#if data.page > 1}
      <form method="GET">
        {#if data.search !== ''}<input type="hidden" name="q" value={data.search} />{/if}
        <button type="submit" name="page" value={data.page - 1}>{m.admin_page_previous()}</button>
      </form>
    {/if}
    <span>{m.admin_page_of({ page: data.page, pages: data.pages })}</span>
    {#if data.page < data.pages}
      <form method="GET">
        {#if data.search !== ''}<input type="hidden" name="q" value={data.search} />{/if}
        <button type="submit" name="page" value={data.page + 1}>{m.admin_page_next()}</button>
      </form>
    {/if}
  </nav>
{/if}

<style>
  .field {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  input {
    flex: 1 1 14rem;
    padding: 0.4rem 0.6rem;
    font: inherit;
  }

  button {
    padding: 0.4rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--note-bg);
    text-align: start;
    overflow-wrap: anywhere;
  }

  th[scope='row'] {
    display: flex;
    flex-direction: column;
    font-weight: normal;
  }

  .banned {
    margin-inline-start: 0.4rem;
    color: var(--accent);
  }

  a {
    color: var(--accent);
  }

  .pages {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }
</style>
