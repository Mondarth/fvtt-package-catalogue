<!--
  A user's admin page: what is held of them, their role, ban and sessions, viewing the site as them, and what admins
  did about them. What may not be done to them, such as to the admin themselves, is not offered; the server refuses it
  besides.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { BAN_DAYS_MAX, BAN_REASON_MAX } from '#lib/admin.js';
  import { actionLabel, changeOf } from '#lib/audit-labels.js';
  import Callout from '#lib/components/Callout.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { periodLabel } from '#lib/period-label.js';
  import { providerName } from '#lib/providers.js';
  import { MAX_DAYS, MAX_MONTHS } from '#lib/subscription-limits.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const DONE: Readonly<Record<string, () => string>> = {
    role: m.admin_done_role,
    ban: m.admin_done_ban,
    unban: m.admin_done_unban,
    signOut: m.admin_done_sign_out,
    grant: m.admin_done_grant,
    setEnd: m.admin_done_set_end,
    revoke: m.admin_done_revoke,
  };

  /** A form's problem, by what it was. */
  const PROBLEMS: Readonly<Record<string, () => string>> = {
    period: m.admin_problem_period,
    note: m.admin_problem_note,
    date: m.admin_problem_date,
    reason: m.admin_ban_reason_too_long,
    banDays: m.admin_problem_ban_days,
  };

  /** The section each action's form is in, where what went wrong with it is shown. */
  const SECTIONS: Readonly<Record<string, string>> = {
    role: 'role',
    ban: 'ban',
    unban: 'ban',
    signOut: 'sessions',
    grant: 'grant',
    setEnd: 'setEnd',
    revoke: 'grant',
  };

  const SOURCES: Readonly<Record<string, () => string>> = {
    grant: m.subscription_source_grant,
    patreon: m.subscription_source_patreon,
    payment: m.subscription_source_payment,
  };

  const REFUSED: Readonly<Record<string, () => string>> = {
    impersonating: m.admin_refused_impersonating,
    self: m.admin_refused_self,
    configured: m.admin_refused_configured,
    admin: m.admin_refused_admin,
    role: m.admin_refused_role,
    failed: m.admin_refused_failed,
  };

  const user = $derived(data.user);
  const date = (when: Date) => when.toLocaleDateString(getLocale());
  const time = (when: Date) => when.toLocaleString(getLocale());
  // What went wrong, and in which section: a form's problem or refusal, beside its form; or the refusal viewing the
  // site as them came back with, at the top, as its section is not shown for everyone.
  const result = $derived(form as { action?: string; refusal?: string | null; problem?: string } | null);
  const failure = $derived.by(() => {
    if (result?.action !== undefined) {
      const said =
        result.problem !== undefined
          ? PROBLEMS[result.problem]
          : (REFUSED[result.refusal ?? 'failed'] ?? REFUSED.failed);
      return {
        section: SECTIONS[result.action] ?? 'top',
        problem: result.problem,
        message: (said ?? REFUSED.failed)?.() ?? '',
      };
    }
    return data.refused === null
      ? undefined
      : { section: 'top', problem: undefined, message: (REFUSED[data.refused] ?? REFUSED.failed)?.() ?? '' };
  });
  /** Whether a field is what went wrong, for `aria-invalid`. */
  const invalid = (section: string, ...problems: string[]) =>
    failure?.section === section && failure.problem !== undefined && problems.includes(failure.problem);
  // Only what may be done to them is offered.
  const manageable = $derived(!user.self && !user.configured);
</script>

<svelte:head>
  <title>{user.nickname ?? user.handle} · {m.admin_users_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{user.nickname ?? user.handle}</h1>

{#if data.done !== null && DONE[data.done] !== undefined}
  <p role="status">{DONE[data.done]?.()}</p>
{/if}
{#snippet failed(section: string)}
  {#if failure?.section === section}
    <Callout id="{section}-problem">{failure.message}</Callout>
  {/if}
{/snippet}

{@render failed('top')}
{#if user.self}
  <p class="hint">{m.admin_self()}</p>
{:else if user.configured}
  <p class="hint">{m.admin_configured()}</p>
{/if}

<dl class="facts">
  <dt>{m.admin_user_id()}</dt>
  <dd><code>{user.handle}</code></dd>
  <dt>{m.admin_user_name()}</dt>
  <dd>{user.name}</dd>
  <dt>{m.admin_user_email()}</dt>
  <dd>{user.email}</dd>
  <dt>{m.admin_user_providers()}</dt>
  <dd>{user.providers.map(providerName).join(', ') || m.admin_none()}</dd>
  <dt>{m.admin_user_sessions()}</dt>
  <dd>{user.sessions}</dd>
  <dt>{m.admin_user_joined()}</dt>
  <dd>{date(user.createdAt)}</dd>
</dl>

<section aria-labelledby="role">
  <h2 id="role">{m.admin_role_heading()}</h2>
  {#if manageable}
    {@render failed('role')}
    <form method="POST" action="?/role" class="row">
      <label class="visually-hidden" for="role-choice">{m.admin_role_heading()}</label>
      <select id="role-choice" name="role" value={user.admin ? 'admin' : 'user'}>
        <option value="user">{m.admin_role_user()}</option>
        <option value="admin">{m.admin_role_admin()}</option>
      </select>
      <button type="submit">{m.admin_role_save()}</button>
    </form>
  {:else}
    <p>{user.admin ? m.admin_role_admin() : m.admin_role_user()}</p>
  {/if}
</section>

<section aria-labelledby="ban">
  <h2 id="ban">{m.admin_ban_heading()}</h2>
  {@render failed('ban')}
  {#if user.banned}
    <p>
      {user.banExpires === null ? m.admin_banned_forever() : m.admin_banned_until({ date: time(user.banExpires) })}
    </p>
    {#if user.banReason !== null}<p>{m.admin_banned_reason({ reason: user.banReason })}</p>{/if}
    {#if !user.configured}
      <form method="POST" action="?/unban">
        <button type="submit">{m.admin_unban_button()}</button>
      </form>
    {/if}
  {:else if manageable}
    <form method="POST" action="?/ban" class="ban">
      <label for="reason">{m.admin_ban_reason()}</label>
      <input
        id="reason"
        name="reason"
        maxlength={BAN_REASON_MAX}
        aria-invalid={invalid('ban', 'reason')}
        aria-describedby={invalid('ban', 'reason') ? 'ban-problem' : undefined} />
      <label for="days">{m.admin_ban_days()}</label>
      <input
        id="days"
        name="days"
        type="number"
        min="1"
        max={BAN_DAYS_MAX}
        step="1"
        aria-invalid={invalid('ban', 'banDays')}
        aria-describedby={invalid('ban', 'banDays') ? 'ban-problem' : undefined} />
      <button type="submit" class="danger">{m.admin_ban_button()}</button>
    </form>
  {/if}
</section>

{#if !user.self}
  <section aria-labelledby="sessions">
    <h2 id="sessions">{m.admin_sessions_heading()}</h2>
    {@render failed('sessions')}
    <form method="POST" action="?/signOut">
      <button type="submit">{m.admin_sign_out_button()}</button>
    </form>
  </section>
{/if}

<section aria-labelledby="subscription">
  <h2 id="subscription">{m.admin_subscription_heading()}</h2>
  <p>
    {#if data.subscription.active && data.subscription.paidUntil !== null}
      {m.admin_subscription_until({ date: time(data.subscription.paidUntil) })}
    {:else if data.subscription.paidUntil !== null}
      {m.admin_subscription_ended({ date: time(data.subscription.paidUntil) })}
    {:else}
      {m.admin_subscription_none()}
    {/if}
  </p>
  {#if data.patreon?.linked}
    <p class="patreon">
      {data.patreon.subscribed ? m.admin_patreon_subscribes() : m.admin_patreon_does_not()}
      {#if data.patreon.membership !== null}
        <span class="hint">
          {m.admin_patreon_said({
            status: data.patreon.membership.patronStatus ?? '–',
            amount: data.patreon.membership.amount === null ? '–' : String(data.patreon.membership.amount),
            checked: data.patreon.membership.checkedAt === null ? '–' : time(data.patreon.membership.checkedAt),
          })}
          {#if data.patreon.membership.failure !== null}
            {m.admin_patreon_failure({ failure: data.patreon.membership.failure })}
          {/if}
        </span>
      {/if}
    </p>
  {/if}

  <form method="POST" action="?/grant" class="subscription">
    <h3>{m.admin_grant_heading()}</h3>
    <p class="hint">{m.admin_grant_hint()}</p>
    {@render failed('grant')}
    <div class="row">
      <label>
        {m.admin_grant_months()}
        <input
          name="months"
          type="number"
          min="0"
          max={MAX_MONTHS}
          step="1"
          aria-invalid={invalid('grant', 'period')}
          aria-describedby={invalid('grant', 'period') ? 'grant-problem' : undefined} />
      </label>
      <label>
        {m.admin_grant_days()}
        <input
          name="days"
          type="number"
          min="0"
          max={MAX_DAYS}
          step="1"
          aria-invalid={invalid('grant', 'period')}
          aria-describedby={invalid('grant', 'period') ? 'grant-problem' : undefined} />
      </label>
    </div>
    <label for="grant-note">{m.admin_note()}</label>
    <input
      id="grant-note"
      name="note"
      maxlength="200"
      aria-invalid={invalid('grant', 'note')}
      aria-describedby={invalid('grant', 'note') ? 'grant-problem' : undefined} />
    <button type="submit">{m.admin_grant_button()}</button>
  </form>

  <form method="POST" action="?/setEnd" class="subscription">
    <h3>{m.admin_set_end_heading()}</h3>
    <p class="hint">{m.admin_set_end_hint()}</p>
    {@render failed('setEnd')}
    <label for="end">{m.admin_set_end_date()}</label>
    <input
      id="end"
      name="end"
      type="date"
      required
      aria-invalid={invalid('setEnd', 'date')}
      aria-describedby={invalid('setEnd', 'date') ? 'setEnd-problem' : undefined} />
    <label for="end-note">{m.admin_note()}</label>
    <input id="end-note" name="note" maxlength="200" />
    <button type="submit">{m.admin_set_end_button()}</button>
  </form>

  {#if data.subscription.active}
    <form method="POST" action="?/revoke">
      <button type="submit" class="danger">{m.admin_revoke_button()}</button>
    </form>
  {/if}

  <h3>{m.admin_credits_heading()}</h3>
  {#if data.credits.length === 0}
    <p>{m.admin_credits_none()}</p>
  {:else}
    <table class="credits">
      <thead>
        <tr>
          <th scope="col">{m.subscription_column_from()}</th>
          <th scope="col">{m.subscription_column_until()}</th>
          <th scope="col">{m.subscription_column_source()}</th>
          <th scope="col">{m.subscription_column_period()}</th>
          <th scope="col">{m.admin_credit_column_by()}</th>
          <th scope="col">{m.admin_credit_column_note()}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.credits as credit (credit.id)}
          <tr>
            <td>{date(credit.startsAt)}</td>
            <td>{date(credit.endsAt)}</td>
            <td>
              {SOURCES[credit.source]?.() ?? credit.source}
              {#if credit.dashboard !== null}<a class="hint" href={credit.dashboard} rel="external noopener"
                  >{credit.provider}
                  {credit.externalRef}{credit.providerAccount === 'test' ? ` (${m.admin_credit_test()})` : ''}</a
                >{:else if credit.provider !== null}<span class="hint"
                  >{credit.provider}{credit.externalRef === null ? '' : ` ${credit.externalRef}`}</span
                >{/if}
            </td>
            <td>{credit.months + credit.days > 0 ? periodLabel(credit) : '–'}</td>
            <td>
              {#if credit.grantedBy !== null}<a href={resolve('/admin/users/[id]', { id: credit.grantedBy })}
                  ><code>{credit.grantedBy}</code></a
                >{/if}
            </td>
            <td>{credit.note ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

{#if !user.self && !user.admin}
  <section aria-labelledby="impersonate">
    <h2 id="impersonate">{m.admin_impersonate_heading()}</h2>
    <p class="hint">{m.admin_impersonate_hint()}</p>
    <form method="POST" action={resolve('/admin/users/[id]/impersonate', { id: user.id })}>
      <button type="submit">{m.admin_impersonate_button()}</button>
    </form>
  </section>
{/if}

<section aria-labelledby="audit">
  <h2 id="audit">{m.admin_user_audit_heading()}</h2>
  {#if data.audit.length === 0}
    <p>{m.admin_audit_none()}</p>
  {:else}
    <ul class="audit">
      {#each data.audit as entry (entry.id)}
        <li>
          <time datetime={entry.at.toISOString()}>{time(entry.at)}</time>
          {actionLabel(entry.action)}
          {#if changeOf(entry.before, entry.after) !== ''}<span class="hint">{changeOf(entry.before, entry.after)}</span
            >{/if}
        </li>
      {/each}
    </ul>
    <p><a href={resolve('/admin/audit')}>{m.admin_nav_audit()}</a></p>
  {/if}
</section>

<style>
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.3rem 1rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  section {
    margin-block: 1.5rem;
  }

  .row,
  .ban {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .ban {
    flex-direction: column;
    align-items: start;
  }

  input,
  select {
    padding: 0.4rem 0.6rem;
    font: inherit;
  }

  #reason {
    width: min(100%, 30rem);
  }

  button {
    padding: 0.4rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .danger {
    border-color: var(--accent);
    color: var(--accent);
  }

  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .audit {
    padding-inline-start: 1.2rem;
  }

  .audit li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.6rem;
  }

  a {
    color: var(--accent);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .subscription {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: start;
    margin-block: 1rem;
  }

  .subscription h3 {
    margin: 0;
  }

  .subscription input[type='number'] {
    width: 6rem;
  }

  .subscription input:not([type]) {
    width: min(100%, 30rem);
  }

  .credits {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .credits th,
  .credits td {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--note-bg);
    text-align: start;
    overflow-wrap: anywhere;
  }

  .credits .hint {
    display: block;
  }
</style>
