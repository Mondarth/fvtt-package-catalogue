<!--
  The profile page: the user's id and nickname, what is stored about them, and signing out or deleting the profile.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
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

  const DELETE_PROBLEMS = { unconfirmed: m.delete_unconfirmed, stale: m.delete_stale };

  const profile = $derived(data.profile);
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
  <label for="nickname">{m.nickname_label()}</label>
  <div class="field">
    <input
      id="nickname"
      name="nickname"
      value={form !== null && 'given' in form ? form.given : (profile.nickname ?? '')}
      maxlength="64"
      aria-describedby="nickname-hint"
      aria-invalid={problem !== undefined} />
    <button type="submit">{m.nickname_save()}</button>
  </div>
  <p id="nickname-hint" class="hint">{m.nickname_hint()}</p>
  {#if problem !== undefined}
    <p role="alert" class="problem">{NICKNAME_PROBLEMS[problem]()}</p>
  {:else if data.saved}
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
  <button type="submit">{m.sign_out()}</button>
</form>

<section aria-labelledby="delete" class="delete">
  <h2 id="delete">{m.delete_heading()}</h2>
  <p>{m.delete_explanation()}</p>
  {#if data.problem !== null}
    <p role="alert" class="problem">{DELETE_PROBLEMS[data.problem]()}</p>
  {/if}
  <form method="POST" action="/profile/delete">
    <label>
      <input type="checkbox" name="confirm" value="yes" required />
      {m.delete_confirm()}
    </label>
    <button type="submit" class="danger">{m.delete_button()}</button>
  </form>
</section>

<style>
  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .handle,
  .stored {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.3rem 1rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .nickname {
    margin-block: 1.5rem;
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  input:not([type]) {
    flex: 1 1 12rem;
    padding: 0.4rem 0.6rem;
    font: inherit;
  }

  button {
    padding: 0.4rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .problem {
    color: var(--accent);
  }

  a {
    color: var(--accent);
  }

  .delete {
    margin-top: 2.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--note-bg);
  }

  .delete form {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .danger {
    border: 1px solid var(--accent);
    color: var(--accent);
    background: none;
  }
</style>
