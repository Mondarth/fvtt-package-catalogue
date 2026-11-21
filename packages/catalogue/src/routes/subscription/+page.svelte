<!--
  The user's subscription: until when, the time that made it, and the ways to subscribe: Patreon, where the catalogue
  offers it, and the offers on sale.
-->
<script lang="ts">
  import Callout from '#lib/components/Callout.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { periodLabel } from '#lib/period-label.js';
  import { formatPrice } from '#lib/prices.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const SOURCES: Readonly<Record<string, () => string>> = {
    grant: m.subscription_source_grant,
    patreon: m.subscription_source_patreon,
    payment: m.subscription_source_payment,
  };

  const date = (when: Date) => when.toLocaleDateString(getLocale());
  const { paidUntil, active, patreon: byPatreon } = $derived(data.entitlement);

  /** What a refused Patreon action, or link, came to. */
  const PATREON_PROBLEMS: Readonly<Record<string, () => string>> = {
    taken: m.subscription_patreon_error_taken,
    failed: m.subscription_patreon_error_failed,
    only: m.subscription_patreon_error_only,
    refused: m.subscription_patreon_error_refused,
  };
  const PATREON_DONE: Readonly<Record<string, () => string>> = {
    linked: m.subscription_patreon_done_linked,
    unlinked: m.subscription_patreon_done_unlinked,
    checked: m.subscription_patreon_done_checked,
  };
  const patreonProblem = $derived(form?.patreon ?? data.patreonError);
  const patreonDone = $derived(patreonProblem === null ? PATREON_DONE[data.patreonDone ?? '']?.() : undefined);

  /**
   * What Patreon's last answer means for the user, whose Patreon is linked.
   * @param patreon - Their Patreon
   * @returns What it means, in words
   */
  function patreonSays(patreon: NonNullable<PageProps['data']['patreon']>): string {
    const { membership, minimum } = patreon;
    if (membership?.failure === 'revoked' || membership?.failure === 'scope') return m.subscription_patreon_relink();
    if (membership?.checkedAt == null) return m.subscription_patreon_never();
    if (patreon.subscribed) return m.subscription_patreon_subscribed();
    switch (membership.patronStatus) {
      case 'active_patron':
        return minimum === null || membership.amount === null
          ? m.subscription_patreon_no_minimum()
          : m.subscription_patreon_below({
              amount: formatPrice(minimum.currency, membership.amount, getLocale()),
              minimum: formatPrice(minimum.currency, minimum.amount, getLocale()),
            });
      case 'declined_patron':
        return m.subscription_patreon_declined();
      case 'former_patron':
        return m.subscription_patreon_former();
      default:
        return m.subscription_patreon_not_member();
    }
  }
</script>

<svelte:head>
  <title>{m.subscription_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.subscription_heading()}</h1>

<p class="status">
  {#if active && paidUntil !== null}
    {m.subscription_active({ date: date(paidUntil) })}
  {:else if byPatreon}
    {m.subscription_by_patreon()}
  {:else if paidUntil !== null}
    {m.subscription_ended({ date: date(paidUntil) })}
  {:else}
    {m.subscription_none()}
  {/if}
</p>
{#if data.admin}<p class="hint">{m.subscription_admin()}</p>{/if}
<p>{m.subscription_gives()}</p>

{#if data.patreon !== null}
  <section aria-labelledby="patreon">
    <h2 id="patreon">{m.subscription_patreon_heading()}</h2>
    <p>
      {data.patreon.minimum === null
        ? m.subscription_patreon_intro_unset()
        : m.subscription_patreon_intro({
            amount: formatPrice(data.patreon.minimum.currency, data.patreon.minimum.amount, getLocale()),
          })}
    </p>
    {#if patreonProblem !== null}
      <Callout id="patreon-problem"
        >{PATREON_PROBLEMS[patreonProblem]?.() ?? m.subscription_patreon_error_refused()}</Callout>
    {:else if patreonDone !== undefined}
      <p role="status">{patreonDone}</p>
    {/if}
    {#if data.patreon.linked}
      <p class="patreon-says">{patreonSays(data.patreon)}</p>
      {#if data.patreon.membership?.failure === 'unreachable' && data.patreon.membership.checkedAt !== null}
        <p class="hint">{m.subscription_patreon_unreachable()}</p>
      {/if}
      {#if data.patreon.membership?.checkedAt}
        <p class="hint">
          {m.subscription_patreon_checked({ date: date(data.patreon.membership.checkedAt) })}
          {#if data.patreon.subscribed && data.patreon.membership.nextChargeAt}
            {m.subscription_patreon_next({ date: date(data.patreon.membership.nextChargeAt) })}
          {/if}
        </p>
      {/if}
      <div class="actions">
        {#if data.patreon.membership?.failure === 'revoked' || data.patreon.membership?.failure === 'scope'}
          <form method="post" action="/subscription/link-patreon">
            <button>{m.subscription_patreon_link_again()}</button>
          </form>
        {:else}
          <form method="post" action="?/check"><button>{m.subscription_patreon_check()}</button></form>
        {/if}
        <form method="post" action="?/unlink"><button>{m.subscription_patreon_unlink()}</button></form>
      </div>
    {:else}
      <form method="post" action="/subscription/link-patreon"><button>{m.subscription_patreon_link()}</button></form>
    {/if}
  </section>
{/if}

<section aria-labelledby="offers">
  <h2 id="offers">{m.subscription_offers_heading()}</h2>
  {#if data.offers.length === 0}
    <p>{m.subscription_offers_none()}</p>
  {:else}
    <ul class="offers">
      {#each data.offers as offer (offer.id)}
        <li>
          <strong>{offer.name}</strong>
          <span>{periodLabel(offer)}</span>
          <span class="prices">
            {Object.entries(offer.prices)
              .map(([currency, minor]) => formatPrice(currency, minor, getLocale()))
              .join(' · ')}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="hint">{m.subscription_buy_soon()}</p>
</section>

<section aria-labelledby="history">
  <h2 id="history">{m.subscription_history_heading()}</h2>
  {#if data.history.length === 0}
    <p>{m.subscription_history_none()}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">{m.subscription_column_from()}</th>
          <th scope="col">{m.subscription_column_until()}</th>
          <th scope="col">{m.subscription_column_source()}</th>
          <th scope="col">{m.subscription_column_period()}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.history as credit (credit.id)}
          <tr>
            <td>{date(credit.startsAt)}</td>
            <td>{date(credit.endsAt)}</td>
            <td>{SOURCES[credit.source]?.() ?? credit.source}</td>
            <td>{credit.months + credit.days > 0 ? periodLabel(credit) : '–'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .status {
    font-size: 1.1rem;
  }

  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }

  section {
    margin-block: 1.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .offers {
    display: grid;
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }

  .offers li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--note-bg);
  }

  .prices {
    color: var(--muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--note-bg);
    text-align: start;
  }
</style>
