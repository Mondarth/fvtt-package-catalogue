<!--
  What we store: everything signing in keeps, and what it is used for, row by row as `#lib/stored.js` lists it, so that
  it says what the accounts' tables hold; in a table for each place it comes from: what the visitor provides (directly,
  through the provider they sign in with, or through their browser), and what we create. A page meant to be read, at a
  readable width.
-->
<script lang="ts">
  import { Prose, Table } from '@mondarth/ui';

  import { m } from '#lib/paraglide/messages.js';
  import { PROCESSORS } from '#lib/processors.js';
  import { STORED } from '#lib/stored.js';

  import type { StoredFrom, StoredItem } from '#lib/stored.js';

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
    return: { what: m.privacy_return_what, why: m.privacy_return_why },
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

  /** What the visitor provides, by where it comes from, in the order the page lists them. */
  const PROVIDED: readonly { from: Exclude<StoredFrom, 'us'>; heading: () => string }[] = [
    { from: 'you', heading: m.privacy_provided_you },
    { from: 'provider', heading: m.privacy_provided_provider },
    { from: 'browser', heading: m.privacy_provided_browser },
  ];

  /** The rows that come from one place. */
  const from = (where: StoredFrom) => STORED.filter(item => item.from === where);
</script>

<svelte:head>
  <title>{m.privacy_heading()} · {m.site_title()}</title>
</svelte:head>

{#snippet stored(caption: string, items: readonly StoredItem[])}
  <Table {caption} hideCaption>
    <thead>
      <tr>
        <th scope="col">{m.privacy_column_what()}</th>
        <th scope="col">{m.privacy_column_why()}</th>
      </tr>
    </thead>
    <tbody>
      {#each items as item (item.id)}
        {@const row = ROWS[item.id]}
        <tr data-stored={item.id}>
          <th scope="row">{row?.what()}</th>
          <td>{row?.why()}</td>
        </tr>
      {/each}
    </tbody>
  </Table>
{/snippet}

<Prose>
  <h1>{m.privacy_heading()}</h1>
  <p class="lede">{m.privacy_lede()}</p>
  <p>{m.privacy_intro()}</p>

  <section aria-labelledby="provided" data-stored-from="provided">
    <h2 id="provided">{m.privacy_provided_heading()}</h2>
    {#each PROVIDED as place (place.from)}
      <section aria-labelledby={`from-${place.from}`} data-stored-from={place.from}>
        <h3 id={`from-${place.from}`}>{place.heading()}</h3>
        {@render stored(place.heading(), from(place.from))}
      </section>
    {/each}
  </section>

  <section aria-labelledby="created" data-stored-from="us">
    <h2 id="created">{m.privacy_created_heading()}</h2>
    {@render stored(m.privacy_created_heading(), from('us'))}
  </section>

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
</Prose>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }

  tbody th {
    font-weight: var(--mdr-font-weight-strong);
  }

  /* Every table's columns line up with the others': what, then what it is used for. */
  th:first-child {
    width: 40%;
  }
</style>
