<!--
  What we store: everything signing in keeps, where it comes from and what it is used for, row by row as `#lib/stored.js`
  lists it, so that it says what the accounts' tables hold.
-->
<script lang="ts">
  import { m } from '#lib/paraglide/messages.js';
  import { STORED } from '#lib/stored.js';

  import type { StoredFrom } from '#lib/stored.js';

  /** Each row's messages, by its id in `STORED`. */
  const ROWS: Record<string, { what: () => string; why: () => string }> = {
    name: { what: m.privacy_name_what, why: m.privacy_name_why },
    email: { what: m.privacy_email_what, why: m.privacy_email_why },
    picture: { what: m.privacy_picture_what, why: m.privacy_picture_why },
    handle: { what: m.privacy_handle_what, why: m.privacy_handle_why },
    nickname: { what: m.privacy_nickname_what, why: m.privacy_nickname_why },
    account: { what: m.privacy_account_what, why: m.privacy_account_why },
    tokens: { what: m.privacy_tokens_what, why: m.privacy_tokens_why },
    session: { what: m.privacy_session_what, why: m.privacy_session_why },
    device: { what: m.privacy_device_what, why: m.privacy_device_why },
    pending: { what: m.privacy_pending_what, why: m.privacy_pending_why },
    times: { what: m.privacy_times_what, why: m.privacy_times_why },
  };

  const FROM: Record<StoredFrom, () => string> = {
    provider: m.privacy_from_provider,
    us: m.privacy_from_us,
    you: m.privacy_from_you,
    browser: m.privacy_from_browser,
  };
</script>

<svelte:head>
  <title>{m.privacy_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.privacy_heading()}</h1>
<p class="lede">{m.privacy_lede()}</p>

<table>
  <thead>
    <tr>
      <th scope="col">{m.privacy_column_what()}</th>
      <th scope="col">{m.privacy_column_from()}</th>
      <th scope="col">{m.privacy_column_why()}</th>
    </tr>
  </thead>
  <tbody>
    {#each STORED as item (item.id)}
      {@const row = ROWS[item.id]}
      <tr data-stored={item.id}>
        <th scope="row">{row?.what()}</th>
        <td>{FROM[item.from]()}</td>
        <td>{row?.why()}</td>
      </tr>
    {/each}
  </tbody>
</table>

<section aria-labelledby="kept">
  <h2 id="kept">{m.privacy_kept_heading()}</h2>
  <p>{m.privacy_kept()}</p>
</section>

<section aria-labelledby="cookies">
  <h2 id="cookies">{m.privacy_cookies_heading()}</h2>
  <p>{m.privacy_cookies()}</p>
</section>

<style>
  .lede {
    color: var(--muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--note-bg);
    text-align: start;
    vertical-align: top;
  }

  thead th {
    color: var(--muted);
    font-weight: normal;
  }

  tbody th {
    font-weight: 600;
  }
</style>
