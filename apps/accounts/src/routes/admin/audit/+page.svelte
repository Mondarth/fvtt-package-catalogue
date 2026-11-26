<!--
  The audit log: what admins have done, and what anyone did while an admin viewed the site as them, newest first.
-->
<script lang="ts">
  import { Button, Table } from '@mondarth/ui';

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
  <Table caption={m.admin_audit_heading()} hideCaption>
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
  </Table>
  {#if data.next !== null}
    <form method="GET">
      <input type="hidden" name="before" value={data.next} />
      <Button type="submit">{m.admin_audit_older()}</Button>
    </form>
  {/if}
{/if}

<style>
  td {
    overflow-wrap: break-word;
  }

  form {
    margin-top: var(--mdr-space-4);
  }
</style>
