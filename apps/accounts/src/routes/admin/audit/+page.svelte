<!--
  The audit log: what admins have done, and what anyone did while an admin viewed the site as them, newest first.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { useDates } from '#lib/dates.js';
  import { actionLabel, changeOf } from '#lib/audit-labels.js';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const userLink = (id: string) => resolve('/admin/users/[id]', { id });
  const { dateTime } = useDates();
</script>

<svelte:head>
  <title>{m.admin_audit_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.admin_audit_heading()}</h1>
<p>{m.admin_audit_lede()}</p>

{#if data.entries.length === 0}
  <p>{m.admin_audit_none()}</p>
{:else}
  <table>
    <thead>
      <tr>
        <th scope="col">{m.admin_audit_when()}</th>
        <th scope="col">{m.admin_audit_who()}</th>
        <th scope="col">{m.admin_audit_as()}</th>
        <th scope="col">{m.admin_audit_what()}</th>
        <th scope="col">{m.admin_audit_whom()}</th>
        <th scope="col">{m.admin_audit_change()}</th>
      </tr>
    </thead>
    <tbody>
      {#each data.entries as entry (entry.id)}
        <tr>
          <td><time datetime={entry.at.toISOString()}>{dateTime(entry.at)}</time></td>
          <td><a href={userLink(entry.actorId)}><code>{entry.actorId}</code></a></td>
          <td>
            {#if entry.asUserId !== null}<a href={userLink(entry.asUserId)}><code>{entry.asUserId}</code></a>{/if}
          </td>
          <td>{actionLabel(entry.action)}</td>
          <td>
            {#if entry.subjectId !== null}<a href={userLink(entry.subjectId)}><code>{entry.subjectId}</code></a>{/if}
          </td>
          <td>{changeOf(entry.before, entry.after)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if data.next !== null}
    <form method="GET">
      <input type="hidden" name="before" value={data.next} />
      <button type="submit">{m.admin_audit_older()}</button>
    </form>
  {/if}
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--note-bg);
    text-align: start;
    overflow-wrap: anywhere;
  }

  a {
    color: var(--accent);
  }
</style>
