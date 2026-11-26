<!--
  A purchase's "Cancel and ask for a refund": its button, and the dialog it opens, which says what cancelling it would
  refund, pro rata, and how the days are counted; whether the refund is made at once (within 14 days of buying it) or
  by an admin; and whether it would end the buyer's subscription. Only once they confirm is the refund asked for. For
  one an admin is to make, the buyer says why: a reason chosen, and, for Other, their own words.
-->
<script lang="ts">
  import { Button, Dialog, Field } from '@mondarth/ui';

  import { useDates } from '#lib/dates.js';
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

  let open = $state(false);
  /** The reason chosen. */
  let reason = $state('');

  const { date } = useDates();
</script>

<Button aria-haspopup="dialog" aria-label={label} onclick={() => (open = preview !== null)}
  >{m.subscription_refund_ask()}</Button>
{#if preview !== null}
  <Dialog
    bind:open
    title={preview.atOnce
      ? m.subscription_refund_dialog_cancel_heading()
      : m.subscription_refund_dialog_request_heading()}>
    <form method="post" action="?/refund">
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
        <Field id="refund-reason-{credit}" label={m.subscription_refund_reason()}>
          {#snippet children(field)}
            <select
              {...field}
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
          {/snippet}
        </Field>
        {#if reason === 'other'}
          <Field id="refund-reason-text-{credit}" label={m.subscription_refund_reason_text()}>
            {#snippet children(field)}
              <textarea {...field} name="reason_text" required maxlength={REFUND_REASON_MAX} rows="3"></textarea>
            {/snippet}
          </Field>
        {/if}
      {/if}
      <input type="hidden" name="credit" value={credit} />
      <input type="hidden" name="confirmed" value="yes" />
      <!-- The buttons are the form's, so that confirming posts it. -->
      <div class="actions">
        <Button type="submit" variant="danger">{m.subscription_refund_confirm()}</Button>
        <Button onclick={() => (open = false)}>{m.subscription_refund_dismiss()}</Button>
      </div>
    </form>
  </Dialog>
{/if}

<style>
  form {
    display: grid;
    gap: var(--mdr-space-3);
  }

  p {
    margin: 0;
  }

  .ends {
    padding: var(--mdr-space-2) var(--mdr-space-3);
    border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-warning);
    background: var(--mdr-color-subtle);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2);
    margin-top: var(--mdr-space-3);
  }
</style>
