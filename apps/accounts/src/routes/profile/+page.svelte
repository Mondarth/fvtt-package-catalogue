<!--
  The profile page: the user's id and nickname, what is stored about them, and signing out or deleting the profile.
-->
<script lang="ts">
  import { Button, Callout, Checkbox, Field } from '@mondarth/ui';
  import { resolve } from '$app/paths';
  import { useDates } from '#lib/dates.js';
  import { clientName } from '#lib/device-clients.js';
  import { m } from '#lib/paraglide/messages.js';
  import { providerName } from '#lib/providers.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const NICKNAME_PROBLEMS = {
    length: m.nickname_problem_length,
    characters: m.nickname_problem_characters,
    reserved: m.nickname_problem_reserved,
    taken: m.nickname_problem_taken,
  };

  const DELETE_PROBLEMS = {
    unconfirmed: m.delete_unconfirmed,
    stale: m.delete_stale,
    impersonating: m.delete_impersonating,
    dispute: m.delete_blocked_dispute,
    refund: m.delete_blocked_refund,
  };

  /** Why the profile may not be deleted now, which the disabled button says, by the block. */
  const DELETION_BLOCKS = { dispute: m.delete_blocked_dispute, refund: m.delete_blocked_refund };

  const profile = $derived(data.profile);
  const { dateTime: date } = useDates();

  /** What signed in, by its kind. */
  const kindOf = (kind: string) =>
    kind === 'website' ? m.devices_website() : kind === 'impersonation' ? m.devices_impersonation() : clientName(kind);
  const problem = $derived(form !== null && 'problem' in form ? form.problem : undefined);
</script>

<svelte:head>
  <title>{m.profile_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.profile_heading()}</h1>

<dl class="handle">
  <dt>{m.profile_handle_label()}</dt>
  <dd><code>{profile.handle}</code></dd>
</dl>
<p class="hint">{m.profile_handle_hint()}</p>

<form method="POST" action="?/nickname" class="nickname">
  <Field
    id="nickname"
    label={m.nickname_label()}
    hint={m.nickname_hint()}
    problem={problem === undefined ? undefined : NICKNAME_PROBLEMS[problem]()}>
    {#snippet children(field)}
      <div class="inline">
        <input
          {...field}
          name="nickname"
          value={form !== null && 'given' in form ? form.given : (profile.nickname ?? '')}
          maxlength="64" />
        <Button type="submit">{m.nickname_save()}</Button>
      </div>
    {/snippet}
  </Field>
  {#if problem === undefined && data.saved}
    <p role="status">{m.nickname_saved()}</p>
  {/if}
</form>

<section aria-labelledby="stored">
  <h2 id="stored">{m.profile_stored_heading()}</h2>
  <dl class="stored">
    <dt>{m.profile_name()}</dt>
    <dd>{profile.name}</dd>
    <dt>{m.profile_email()}</dt>
    <dd>{profile.email}</dd>
    <dt>{m.profile_picture()}</dt>
    <dd>{profile.image ?? m.profile_none()}</dd>
    <dt>{m.profile_providers()}</dt>
    <dd>{profile.providers.map(providerName).join(', ') || m.profile_none()}</dd>
  </dl>
  <p><a href={resolve('/privacy')}>{m.privacy_link()}</a></p>
</section>

<form method="POST" action="/sign-out">
  <Button type="submit">{m.sign_out()}</Button>
</form>

<section aria-labelledby="devices">
  <h2 id="devices">{m.devices_heading()}</h2>
  <p class="hint">{m.devices_lede()}</p>
  {#if form !== null && 'devices' in form}
    <Callout>{m.devices_refused()}</Callout>
  {:else if data.signedOut === 'one'}
    <p role="status">{m.devices_signed_out()}</p>
  {:else if data.signedOut === 'others'}
    <p role="status">{m.devices_signed_out_others()}</p>
  {/if}
  <ul class="devices">
    {#each data.devices as device (device.id)}
      <li>
        <div>
          <strong>{kindOf(device.kind)}</strong>
          {#if device.current}<span class="this">{m.devices_this()}</span>{/if}
          {#if device.agent !== null}<span class="hint">{device.agent}</span>{/if}
          <span class="hint">
            {m.devices_created({ date: date(device.createdAt) })} · {m.devices_renewed({
              date: date(device.updatedAt),
            })}
          </span>
        </div>
        {#if !device.current && !data.impersonated}
          <form method="POST" action="?/signOut">
            <input type="hidden" name="session" value={device.id} />
            <Button
              type="submit"
              aria-label={m.devices_sign_out_named({
                device: kindOf(device.kind),
                date: m.devices_created({ date: date(device.createdAt) }),
              })}>{m.devices_sign_out()}</Button>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
  {#if data.devices.length > 1 && !data.impersonated}
    <form method="POST" action="?/signOutOthers">
      <Button type="submit">{m.devices_sign_out_others()}</Button>
    </form>
  {/if}
</section>

<section aria-labelledby="delete" class="delete">
  <h2 id="delete">{m.delete_heading()}</h2>
  <p>{m.delete_explanation()}</p>
  {#if data.problem !== null && data.deletionBlock === null}
    <p role="alert" class="problem">{DELETE_PROBLEMS[data.problem]()}</p>
  {/if}
  <form method="POST" action="/profile/delete">
    <Checkbox id="confirm" name="confirm" value="yes" required disabled={data.deletionBlock !== null}>
      {m.delete_confirm()}
    </Checkbox>
    <Button
      type="submit"
      variant="danger"
      disabled={data.deletionBlock !== null}
      aria-describedby={data.deletionBlock === null ? undefined : 'delete-blocked'}>{m.delete_button()}</Button>
    {#if data.deletionBlock !== null}
      <!-- Why the button is disabled, beside it, for as long as it is. -->
      <p id="delete-blocked" class="blocked">{DELETION_BLOCKS[data.deletionBlock]()}</p>
    {/if}
  </form>
</section>

<style>
  .hint {
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }

  .handle,
  .stored {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--mdr-space-1) var(--mdr-space-4);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .nickname {
    margin-block: var(--mdr-space-5);
  }

  /* The nickname and its button on one line, wrapping on a phone. */
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2);
  }

  .inline input {
    flex: 1 1 12rem;
  }

  .problem {
    color: var(--mdr-color-danger);
    font-weight: var(--mdr-font-weight-strong);
  }

  .delete {
    margin-top: var(--mdr-space-6);
    padding-top: var(--mdr-space-4);
    border-top: var(--mdr-border-width-thin) solid var(--mdr-color-border);
  }

  .blocked {
    margin: 0;
    padding: var(--mdr-space-3) var(--mdr-space-4);
    border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-accent);
    background: var(--mdr-color-subtle);
  }

  .delete form {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-4);
    align-items: center;
  }

  .devices {
    display: grid;
    gap: var(--mdr-space-2);
    padding: 0;
    list-style: none;
  }

  .devices li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-2) var(--mdr-space-4);
    align-items: center;
    justify-content: space-between;
    padding: var(--mdr-space-2) var(--mdr-space-3);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
  }

  .devices li div {
    display: flex;
    flex-direction: column;
  }

  .this {
    color: var(--mdr-color-accent);
    font-size: var(--mdr-font-size-small);
  }
</style>
