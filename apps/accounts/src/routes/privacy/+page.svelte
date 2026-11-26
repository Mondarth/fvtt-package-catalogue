<!--
  What we store: everything signing in keeps, where it comes from and what it is used for, row by row as `#lib/stored.js`
  lists it, so that it says what the accounts' tables hold.
-->
<script lang="ts">
  import { Table } from '@mondarth/ui';

  import { m } from '#lib/paraglide/messages.js';
  import { PROCESSORS } from '#lib/processors.js';
  import { STORED } from '#lib/stored.js';

  import type { StoredFrom } from '#lib/stored.js';

  /** Each row's messages, by its id in `STORED`. */
  const ROWS: Record<string, { what: () => string; why: () => string }> = {
    name: { what: m.privacy_name_what, why: m.privacy_name_why },
    email: { what: m.privacy_email_what, why: m.privacy_email_why },
    picture: { what: m.privacy_picture_what, why: m.privacy_picture_why },
    handle: { what: m.privacy_handle_what, why: m.privacy_handle_why },
    nickname: { what: m.privacy_nickname_what, why: m.privacy_nickname_why },
    role: { what: m.privacy_role_what, why: m.privacy_role_why },
    ban: { what: m.privacy_ban_what, why: m.privacy_ban_why },
    account: { what: m.privacy_account_what, why: m.privacy_account_why },
    tokens: { what: m.privacy_tokens_what, why: m.privacy_tokens_why },
    session: { what: m.privacy_session_what, why: m.privacy_session_why },
    device: { what: m.privacy_device_what, why: m.privacy_device_why },
    impersonation: { what: m.privacy_impersonation_what, why: m.privacy_impersonation_why },
    client: { what: m.privacy_client_what, why: m.privacy_client_why },
    device_sign_in: { what: m.privacy_device_sign_in_what, why: m.privacy_device_sign_in_why },
    audit: { what: m.privacy_audit_what, why: m.privacy_audit_why },
    subscription: { what: m.privacy_subscription_what, why: m.privacy_subscription_why },
    checkout: { what: m.privacy_checkout_what, why: m.privacy_checkout_why },
    last_session: { what: m.privacy_last_session_what, why: m.privacy_last_session_why },
    access: { what: m.privacy_access_what, why: m.privacy_access_why },
    known_identities: { what: m.privacy_known_identities_what, why: m.privacy_known_identities_why },
    payment: { what: m.privacy_payment_what, why: m.privacy_payment_why },
    patreon: { what: m.privacy_patreon_what, why: m.privacy_patreon_why },
    pending: { what: m.privacy_pending_what, why: m.privacy_pending_why },
    times: { what: m.privacy_times_what, why: m.privacy_times_why },
  };

  /** What each payment processor keeps, by its id in `PROCESSORS`. */
  const KEEPS: Record<string, () => string> = {
    patreon: m.privacy_processor_patreon_what,
    stripe: m.privacy_processor_stripe_what,
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

<Table caption={m.privacy_heading()} hideCaption>
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
</Table>

<section aria-labelledby="payments">
  <h2 id="payments">{m.privacy_payments_heading()}</h2>
  <p>{m.privacy_payments()}</p>
  <p>{m.privacy_invoices()}</p>
  <ul>
    {#each PROCESSORS as processor (processor.id)}
      <li data-processor={processor.id}>
        <strong>{processor.name}</strong>: {KEEPS[processor.id]?.()}
        <a href={processor.policy} rel="external noopener noreferrer">{m.privacy_processor_policy()}</a>
      </li>
    {/each}
  </ul>
</section>

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
    color: var(--mdr-color-text-muted);
  }

  tbody th {
    font-weight: var(--mdr-font-weight-strong);
  }
</style>
