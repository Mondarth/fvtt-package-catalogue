<!--
  The user's subscription: until when, the time that made it, and the ways to subscribe.
-->
<script lang="ts">
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { periodLabel } from '#lib/period-label.js';
  import { formatPrice } from '#lib/prices.js';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const SOURCES: Readonly<Record<string, () => string>> = {
    grant: m.subscription_source_grant,
    patreon: m.subscription_source_patreon,
    payment: m.subscription_source_payment,
  };

  const date = (when: Date) => when.toLocaleDateString(getLocale());
  const { paidUntil, active } = $derived(data.entitlement);
</script>

<svelte:head>
  <title>{m.subscription_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.subscription_heading()}</h1>

<p class="status">
  {#if active && paidUntil !== null}
    {m.subscription_active({ date: date(paidUntil) })}
  {:else if paidUntil !== null}
    {m.subscription_ended({ date: date(paidUntil) })}
  {:else}
    {m.subscription_none()}
  {/if}
</p>
{#if data.admin}<p class="hint">{m.subscription_admin()}</p>{/if}
<p>{m.subscription_gives()}</p>

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
