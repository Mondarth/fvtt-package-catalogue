<!--
  The offers subscriptions are bought by: each with its period, prices and whether it is on sale, a button to retire
  one on sale, and the form for a new one.
-->
<script lang="ts">
  import { resolve } from '$app/paths';

  import { useDates } from '#lib/dates.js';
  import Callout from '#lib/components/Callout.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { periodLabel } from '#lib/period-label.js';
  import { formatPrice } from '#lib/prices.js';
  import { REFUND_REASON_LABELS } from '#lib/refund-reason-labels.js';
  import { MAX_DAYS, MAX_MONTHS } from '#lib/subscription-limits.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const DONE: Readonly<Record<string, () => string>> = {
    create: m.admin_done_create,
    retire: m.admin_done_retire,
    patreon: m.admin_done_patreon,
  };

  const { date } = useDates();
  const problem = $derived(form !== null && 'problem' in form ? form.problem : undefined);
  const minimum = $derived(
    data.patreonMinimum === undefined || data.patreonMinimum === null
      ? null
      : formatPrice(data.patreonMinimum.currency, data.patreonMinimum.amount, getLocale()),
  );
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
              {#if offer.providers.includes('stripe')}<span class="hint">{m.admin_offer_stripe()}</span>{/if}
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

<section aria-labelledby="refund-requests">
  <h2 id="refund-requests">{m.admin_refunds_heading()}</h2>
  {#if data.refundRequests.length === 0}
    <p>{m.admin_refunds_none()}</p>
  {:else}
    <p>{m.admin_refunds_lede()}</p>
    <table>
      <thead>
        <tr>
          <th scope="col">{m.admin_refunds_column_user()}</th>
          <th scope="col">{m.admin_refunds_column_asked()}</th>
          <th scope="col">{m.admin_refunds_column_purchase()}</th>
          <th scope="col">{m.admin_refunds_column_paid()}</th>
          <th scope="col">{m.admin_refunds_column_suggested()}</th>
          <th scope="col">{m.admin_refunds_column_reason()}</th>
          <th scope="col"><span class="visually-hidden">{m.admin_refunds_make()}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each data.refundRequests as asked (asked.creditId)}
          <tr>
            <th scope="row"><a href={resolve('/admin/users/[id]', { id: asked.userId })}>{asked.handle}</a></th>
            <td>{asked.requestedAt === null ? '–' : date(asked.requestedAt)}</td>
            <td>
              {m.admin_refunds_purchase({
                purchased: date(asked.purchasedAt),
                from: date(asked.startsAt),
                until: date(asked.endsAt),
              })}
            </td>
            <td>{asked.paid === null ? '–' : formatPrice(asked.paid.currency, asked.paid.amount, getLocale())}</td>
            <td>
              {#if asked.suggested !== null && asked.paid !== null}
                {m.admin_refunds_suggested({
                  amount: formatPrice(asked.paid.currency, asked.suggested.amount, getLocale()),
                  days: asked.suggested.days,
                  of: asked.suggested.of,
                })}
              {:else}
                –
              {/if}
            </td>
            <td>
              {#if asked.reason}
                {REFUND_REASON_LABELS[asked.reason]()}
                {#if asked.reasonText}<span class="hint">{asked.reasonText}</span>{/if}
              {:else}
                –
              {/if}
            </td>
            <td>
              {#if asked.dashboard !== null}<a href={asked.dashboard} rel="external noopener"
                  >{m.admin_refunds_make()}</a
                >{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section aria-labelledby="disputes">
  <h2 id="disputes">{m.admin_disputes_heading()}</h2>
  {#if data.disputes.length === 0}
    <p>{m.admin_disputes_none()}</p>
  {:else}
    <p>{m.admin_disputes_lede()}</p>
    <p class="hint">{m.admin_disputes_evidence_hint()}</p>
    <table>
      <thead>
        <tr>
          <th scope="col">{m.admin_refunds_column_user()}</th>
          <th scope="col">{m.admin_disputes_column_opened()}</th>
          <th scope="col">{m.admin_refunds_column_purchase()}</th>
          <th scope="col">{m.admin_refunds_column_paid()}</th>
          <th scope="col"><span class="visually-hidden">{m.admin_disputes_evidence()}</span></th>
          <th scope="col"><span class="visually-hidden">{m.admin_disputes_answer()}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each data.disputes as disputed (disputed.creditId)}
          <tr>
            <th scope="row"><a href={resolve('/admin/users/[id]', { id: disputed.userId })}>{disputed.handle}</a></th>
            <td>{disputed.openedAt ? date(disputed.openedAt) : '–'}</td>
            <td>
              {m.admin_refunds_purchase({
                purchased: date(disputed.purchasedAt),
                from: date(disputed.startsAt),
                until: date(disputed.endsAt),
              })}
            </td>
            <td>{disputed.paid ? formatPrice(disputed.paid.currency, disputed.paid.amount, getLocale()) : '–'}</td>
            <td>
              <a
                href={resolve('/admin/subscriptions/evidence/[credit]', { credit: disputed.creditId })}
                download
                aria-label={m.admin_disputes_evidence_named({ handle: disputed.handle })}
                >{m.admin_disputes_evidence()}</a>
            </td>
            <td>
              {#if disputed.dashboard}<a href={disputed.dashboard} rel="external noopener"
                  >{m.admin_disputes_answer()}</a
                >{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

{#if data.patreonMinimum !== undefined}
  <section aria-labelledby="patreon-minimum">
    <h2 id="patreon-minimum">{m.admin_patreon_heading()}</h2>
    <p>{minimum === null ? m.admin_patreon_unset() : m.admin_patreon_set({ amount: minimum })}</p>
    <form method="POST" action="?/patreonMinimum" class="minimum">
      {#if problem === 'minimum'}
        <Callout id="minimum-problem">{m.admin_patreon_problem()}</Callout>
      {/if}
      <label for="minimum">{m.admin_patreon_label()}</label>
      <input
        id="minimum"
        name="minimum"
        placeholder="GBP 5.00"
        value={problem === 'minimum' && form !== null && 'minimum' in form ? form.minimum : ''}
        aria-invalid={problem === 'minimum'}
        aria-describedby={problem === 'minimum' ? 'minimum-problem' : 'minimum-hint'} />
      <p id="minimum-hint" class="hint">{m.admin_patreon_hint()}</p>
      <button type="submit">{m.admin_patreon_save()}</button>
    </form>
  </section>
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
        {:else if problem === 'stripe'}
          {m.admin_offer_problem_stripe()}
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
      aria-describedby={problem === 'prices'
        ? 'offer-problem'
        : data.stripeCurrency === null
          ? undefined
          : 'stripe-hint'}>{given('prices')}</textarea>
    {#if data.stripeCurrency !== null}
      <p id="stripe-hint" class="hint">{m.admin_offer_stripe_hint({ currency: data.stripeCurrency })}</p>
    {/if}
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

  .new,
  .minimum {
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
