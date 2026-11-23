<!--
  Signing a device in: signing in first; entering the code it shows, if it was not in the link; which client asks,
  with the code to check, and approving or denying it; and what came of it.
-->
<script lang="ts">
  import { Callout } from '@mondarth/ui';
  import SignIn from '#lib/components/SignIn.svelte';
  import { clientName } from '#lib/device-clients.js';
  import { m } from '#lib/paraglide/messages.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // A decision refused, such as for a code that expired meanwhile, says so in place of the page.
  const state = $derived(form?.state ?? data.state);

  const SAID: Readonly<Record<string, () => string>> = {
    approved: m.device_approved,
    denied: m.device_denied,
    expired: m.device_expired,
    unknown: m.device_unknown,
    already: m.device_already,
    impersonating: m.device_impersonating,
  };
</script>

<svelte:head>
  <title>{m.device_heading()} · {m.site_title()}</title>
</svelte:head>

{#if data.state === 'sign-in'}
  <p class="lede">{m.device_sign_in_first()}</p>
  <SignIn providers={data.providers} next={data.next} />
{:else}
  <h1>{m.device_heading()}</h1>

  {#if state === 'confirm' && data.state === 'confirm'}
    <p>{m.device_confirm({ client: clientName(data.client) })}</p>
    <p class="code"><code>{data.code}</code></p>
    <p class="hint">{m.device_check()}</p>
    <div class="decide">
      <form method="POST" action="?/approve">
        <input type="hidden" name="code" value={data.code} />
        <button type="submit">{m.device_approve()}</button>
      </form>
      <form method="POST" action="?/deny">
        <input type="hidden" name="code" value={data.code} />
        <button type="submit" class="deny">{m.device_deny()}</button>
      </form>
    </div>
  {:else if state === 'enter'}
    <form method="GET" class="enter">
      <label for="user_code">{m.device_enter_label()}</label>
      <input id="user_code" name="user_code" autocomplete="off" aria-describedby="user-code-hint" required />
      <p id="user-code-hint" class="hint">{m.device_enter_hint()}</p>
      <button type="submit">{m.device_enter_button()}</button>
    </form>
  {:else if state === 'approved' || state === 'denied'}
    <p role="status">{SAID[state]?.()}</p>
  {:else}
    <Callout>{SAID[state]?.()}</Callout>
  {/if}
{/if}

<style>
  .lede {
    color: var(--muted);
  }

  .code {
    font-size: 1.6rem;
    letter-spacing: 0.15em;
  }

  .hint {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .decide {
    display: flex;
    gap: 1rem;
  }

  .enter {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: start;
  }

  input {
    padding: 0.4rem 0.6rem;
    font: inherit;
    text-transform: uppercase;
  }

  button {
    padding: 0.4rem 0.9rem;
    font: inherit;
    cursor: pointer;
  }

  .deny {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
