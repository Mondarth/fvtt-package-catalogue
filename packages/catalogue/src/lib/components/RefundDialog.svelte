<!--
  A purchase's "Cancel and ask for a refund": its button, and the dialog it opens, which says what cancelling it would
  refund, pro rata, and how the days are counted; whether the refund is made at once (within 14 days of buying it) or
  by an admin; and whether it would end the buyer's subscription. Only once they confirm is the refund asked for. For
  one an admin is to make, the buyer says why: a reason chosen, and, for Other, their own words.
-->
<script lang="ts">
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { formatPrice } from '#lib/prices.js';
  import { REFUND_REASON_LABELS } from '#lib/refund-reason-labels.js';
  import { REFUND_REASONS, REFUND_REASON_MAX } from '#lib/refund-reasons.js';

  /** What cancelling the purchase would do, as the server works it out. */
  interface Preview {
    /** The refund, in the minor unit of `currency`. */
    readonly amount: number;
    /** The purchase's days not yet used, and all of them. */
    readonly days: number;
    readonly of: number;
    /** What was paid for it, if kept. */
    readonly paid: number | null;
    readonly currency: string;
    /** When the days not yet used are counted from: now, or when the purchase's time starts, if later. */
    readonly countedFrom: Date;
    /** Whether the refund is made at once, within 14 days of buying it. */
    readonly atOnce: boolean;
    /** Whether it would leave the buyer unsubscribed. */
    readonly endsSubscription: boolean;
  }

  interface Props {
    /** The purchase's credit, whose refund is asked for. */
    credit: string;
    /** The button's name, saying which purchase it is. */
    label: string;
    /** What cancelling it would do; none, and the button opens nothing. */
    preview: Preview | null;
  }

  let { credit, label, preview }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  /** The reason chosen. */
  let reason = $state('');

  const date = (when: Date) => when.toLocaleDateString(getLocale());
</script>

<button type="button" aria-haspopup="dialog" aria-label={label} onclick={() => dialog?.showModal()}
  >{m.subscription_refund_ask()}</button>
{#if preview !== null}
  <dialog bind:this={dialog} aria-labelledby="refund-{credit}" class="refund">
    <form method="post" action="?/refund">
      <h3 id="refund-{credit}">
        {preview.atOnce
          ? m.subscription_refund_dialog_cancel_heading()
          : m.subscription_refund_dialog_request_heading()}
      </h3>
      <p>
        {m.subscription_refund_dialog_amount({
          paid: preview.paid === null ? '–' : formatPrice(preview.currency, preview.paid, getLocale()),
          of: preview.of,
          days: preview.days,
          date: date(preview.countedFrom),
          amount: formatPrice(preview.currency, preview.amount, getLocale()),
        })}
      </p>
      <p>{preview.atOnce ? m.subscription_refund_dialog_at_once() : m.subscription_refund_dialog_later()}</p>
      {#if preview.endsSubscription}
        <p class="ends">{m.subscription_refund_dialog_ends()}</p>
      {/if}
      {#if !preview.atOnce}
        <label>
          {m.subscription_refund_reason()}
          <select
            name="reason"
            required
            onchange={event => {
              reason = event.currentTarget.value;
            }}>
            <option value="">{m.subscription_refund_reason_choose()}</option>
            {#each REFUND_REASONS as given (given)}
              <option value={given}>{REFUND_REASON_LABELS[given]()}</option>
            {/each}
          </select>
        </label>
        {#if reason === 'other'}
          <label>
            {m.subscription_refund_reason_text()}
            <textarea name="reason_text" required maxlength={REFUND_REASON_MAX} rows="3"></textarea>
          </label>
        {/if}
      {/if}
      <input type="hidden" name="credit" value={credit} />
      <input type="hidden" name="confirmed" value="yes" />
      <div class="actions">
        <button type="submit">{m.subscription_refund_confirm()}</button>
        <button type="button" onclick={() => dialog?.close()}>{m.subscription_refund_dismiss()}</button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .refund {
    max-width: min(32rem, calc(100vw - 2rem));
    padding: 1rem 1.2rem;
    border: 1px solid var(--note-bg);
    background: var(--bg);
    color: var(--fg);
  }

  .refund form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .refund h3 {
    margin: 0;
  }

  .refund label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .ends {
    padding: 0.5rem 0.7rem;
    border-inline-start: 3px solid var(--accent);
    background: var(--note-bg);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
