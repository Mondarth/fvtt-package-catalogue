<!--
  Signing a device in: signing in first; entering the code it shows, if it was not in the link; which client asks,
  with the code to check, and approving or denying it; and what came of it.
-->
<script lang="ts">
  import { Button, Callout, Field } from '@mondarth/ui';
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
        <Button type="submit" variant="primary">{m.device_approve()}</Button>
      </form>
      <form method="POST" action="?/deny">
        <input type="hidden" name="code" value={data.code} />
        <Button type="submit" variant="danger">{m.device_deny()}</Button>
      </form>
    </div>
  {:else if state === 'enter'}
    <form method="GET" class="enter">
      <Field id="user_code" label={m.device_enter_label()} hint={m.device_enter_hint()} required>
        {#snippet children(field)}<input {...field} name="user_code" autocomplete="off" />{/snippet}
      </Field>
      <Button type="submit">{m.device_enter_button()}</Button>
    </form>
  {:else if state === 'approved' || state === 'denied'}
    <p role="status">{SAID[state]?.()}</p>
  {:else}
    <Callout>{SAID[state]?.()}</Callout>
  {/if}
{/if}

<style>
  .lede,
  .hint {
    color: var(--mdr-color-text-muted);
  }

  .hint {
    font-size: var(--mdr-font-size-small);
  }

  .code {
    font-size: var(--mdr-font-size-title);
    letter-spacing: 0.15em;
  }

  .decide {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mdr-space-4);
  }

  .enter {
    display: grid;
    gap: var(--mdr-space-3);
    justify-items: start;
  }

  .enter :global(input) {
    text-transform: uppercase;
  }
</style>
