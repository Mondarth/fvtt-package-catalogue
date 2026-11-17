<!--
  The offers subscriptions are bought by: each with its period, prices and whether it is on sale, a button to retire
  one on sale, and the form for a new one.
-->
<script lang="ts">
  import Callout from '#lib/components/Callout.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { periodLabel } from '#lib/period-label.js';
  import { formatPrice } from '#lib/prices.js';
  import { MAX_DAYS, MAX_MONTHS } from '#lib/subscription-limits.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const DONE: Readonly<Record<string, () => string>> = {
    create: m.admin_done_create,
    retire: m.admin_done_retire,
  };

  const date = (when: Date) => when.toLocaleDateString(getLocale());
  const problem = $derived(form !== null && 'problem' in form ? form.problem : undefined);
  const given = (name: 'name' | 'months' | 'days' | 'prices') => {
    const value = form === null ? undefined : (form as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : '';
  };
</script>

<svelte:head>
  <title>{m.admin_offers_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.admin_offers_heading()}</h1>
<p>{m.admin_offers_lede()}</p>

{#if data.done !== null && DONE[data.done] !== undefined}
  <p role="status">{DONE[data.done]?.()}</p>
{/if}

{#if data.offers.length === 0}
  <p>{m.admin_offers_none()}</p>
{:else}
  <table>
    <thead>
      <tr>
        <th scope="col">{m.admin_offer_column_name()}</th>
        <th scope="col">{m.admin_offer_column_period()}</th>
        <th scope="col">{m.admin_offer_column_prices()}</th>
        <th scope="col">{m.admin_offer_column_status()}</th>
        <th scope="col"><span class="visually-hidden">{m.admin_offer_retire()}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each data.offers as offer (offer.id)}
        <tr>
          <th scope="row">{offer.name}</th>
          <td>{periodLabel(offer)}</td>
          <td>
            {Object.entries(offer.prices)
              .map(([currency, minor]) => formatPrice(currency, minor, getLocale()))
              .join(' · ')}
          </td>
          <td>
            {#if offer.retiredAt !== null}
              {m.admin_offer_retired({ date: date(offer.retiredAt) })}
            {:else}
              {m.admin_offer_on_sale()}
              {#if offer.availableFrom !== null}<span class="hint"
                  >{m.admin_offer_from({ date: date(offer.availableFrom) })}</span
                >{/if}
              {#if offer.availableUntil !== null}<span class="hint"
                  >{m.admin_offer_until({ date: date(offer.availableUntil) })}</span
                >{/if}
            {/if}
          </td>
          <td>
            {#if offer.retiredAt === null}
              <form method="POST" action="?/retire">
                <input type="hidden" name="offer" value={offer.id} />
                <button type="submit" aria-label={`${m.admin_offer_retire()}: ${offer.name}`}
                  >{m.admin_offer_retire()}</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<section aria-labelledby="new-offer">
  <h2 id="new-offer">{m.admin_offer_new_heading()}</h2>
  <form method="POST" action="?/create" class="new">
    {#if problem !== undefined}
      <!-- In the form, by the fields it is about, and taking the focus, so that it is seen. -->
      <Callout id="offer-problem">
        {#if problem === 'name'}
          {m.admin_offer_problem_name()}
        {:else if problem === 'period'}
          {m.admin_problem_period()}
        {:else if problem === 'prices'}
          {form !== null && 'line' in form && form.line !== ''
            ? m.admin_offer_problem_prices({ line: form.line })
            : m.admin_offer_problem_no_prices()}
        {:else}
          {m.admin_offer_problem_dates()}
        {/if}
      </Callout>
    {/if}
    <label for="name">{m.admin_offer_name()}</label>
    <input
      id="name"
      name="name"
      maxlength="80"
      value={given('name')}
      required
      aria-invalid={problem === 'name'}
      aria-describedby={problem === 'name' ? 'offer-problem' : undefined} />
    <div class="period">
      <label>
        {m.admin_grant_months()}
        <input
          name="months"
          type="number"
          min="0"
          max={MAX_MONTHS}
          step="1"
          value={given('months')}
          aria-invalid={problem === 'period'}
          aria-describedby={problem === 'period' ? 'offer-problem' : undefined} />
      </label>
      <label>
        {m.admin_grant_days()}
        <input
          name="days"
          type="number"
          min="0"
          max={MAX_DAYS}
          step="1"
          value={given('days')}
          aria-invalid={problem === 'period'}
          aria-describedby={problem === 'period' ? 'offer-problem' : undefined} />
      </label>
    </div>
    <label for="prices">{m.admin_offer_prices()}</label>
    <textarea
      id="prices"
      name="prices"
      rows="3"
      aria-invalid={problem === 'prices'}
      aria-describedby={problem === 'prices' ? 'offer-problem' : undefined}>{given('prices')}</textarea>
    <div class="period">
      <label>
        {m.admin_offer_available_from()}
        <input
          name="from"
          type="date"
          aria-invalid={problem === 'dates'}
          aria-describedby={problem === 'dates' ? 'offer-problem' : undefined} />
      </label>
      <label>
        {m.admin_offer_available_until()}
        <input
          name="until"
          type="date"
          aria-invalid={problem === 'dates'}
          aria-describedby={problem === 'dates' ? 'offer-problem' : undefined} />
      </label>
    </div>
    <button type="submit">{m.admin_offer_create()}</button>
  </form>
</section>

<style>
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

  td form {
    margin: 0;
  }

  .hint {
    display: block;
    color: var(--muted);
    font-size: 0.9rem;
  }

  section {
    margin-block: 1.5rem;
  }

  .new {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: start;
  }

  .period {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  input,
  textarea {
    padding: 0.4rem 0.6rem;
    font: inherit;
  }

  #name,
  textarea {
    width: min(100%, 30rem);
  }

  input[type='number'] {
    width: 6rem;
  }

  button {
    padding: 0.4rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
