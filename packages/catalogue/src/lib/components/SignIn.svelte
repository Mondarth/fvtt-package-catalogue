<!--
  The sign-in page: a button for each provider, each a form of its own so that signing in needs no script, and, before
  any of them, what signing in stores, with a link to the page that lays it out.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import Logo from '#lib/components/Logo.svelte';
  import { m } from '#lib/paraglide/messages.js';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { providerName } from '#lib/providers.js';

  interface Props {
    /** The ids of the providers offered. */
    providers: readonly string[];
    /** Whether the last sign-in did not work. */
    failed?: boolean;
    /**
     * Whether it did not as its user is banned: with until when and why, where the page could tell; none for another
     * failure.
     */
    banned?: { known: false } | { known: true; reason: string | null; until: Date | null } | null;
    /** The page of this site to come back to, signed in; home if none. */
    next?: string | undefined;
  }

  let { providers, failed = false, banned = null, next }: Props = $props();
</script>

<div class="logo"><Logo height="6rem" /></div>
<h1>{m.sign_in_heading()}</h1>
<p class="lede">{m.sign_in_lede()}</p>

{#if banned !== null}
  <div role="alert" class="failed">
    {#if !banned.known}
      <p>{m.sign_in_banned()}</p>
    {:else}
      <p>
        {banned.until === null
          ? m.sign_in_banned_forever()
          : m.sign_in_banned_until({ date: banned.until.toLocaleString(getLocale()) })}
      </p>
      {#if banned.reason !== null}<p>{m.sign_in_banned_reason({ reason: banned.reason })}</p>{/if}
    {/if}
  </div>
{:else if failed}
  <p role="alert" class="failed">{m.sign_in_failed()}</p>
{/if}

<p class="stores">
  {m.sign_in_stores()}
  <a href={resolve('/privacy')}>{m.privacy_link()}</a>
</p>

{#if providers.length === 0}
  <p>{m.sign_in_none()}</p>
{:else}
  <ul class="providers">
    {#each providers as provider (provider)}
      <li>
        <form method="POST" action="/sign-in/{provider}">
          {#if next !== undefined}<input type="hidden" name="next" value={next} />{/if}
          <button type="submit">{m.sign_in_with({ provider: providerName(provider) })}</button>
        </form>
      </li>
    {/each}
  </ul>
{/if}

<footer>
  <a href={resolve('/developers')}>{m.developers_link()}</a>
</footer>

<style>
  .logo {
    margin-top: 2rem;
  }

  .lede,
  .stores {
    color: var(--muted);
  }

  .failed {
    padding: 0.5rem 0.8rem;
    border-left: 3px solid var(--accent);
    background: var(--note-bg);
  }

  .failed p {
    margin: 0;
  }

  .failed p + p {
    margin-top: 0.3rem;
  }

  .providers {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 20rem;
    margin: 1.5rem 0;
    padding: 0;
    list-style: none;
  }

  button {
    width: 100%;
    padding: 0.6rem 1rem;
    border: 1px solid var(--muted);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    border-color: var(--accent);
  }

  a {
    color: var(--accent);
  }

  footer {
    margin-top: 3rem;
    font-size: 0.9rem;
  }
</style>
