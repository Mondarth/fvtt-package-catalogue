<!--
  The sign-in page: a button for each provider, each a form of its own so that signing in needs no script, and, before
  any of them, what signing in stores, with a link to the page that lays it out.
-->
<script lang="ts">
  import { Button, Callout, Logo } from '@mondarth/ui';
  import { resolve } from '$app/paths';
  import { useDates } from '#lib/dates.js';
  import { m } from '#lib/paraglide/messages.js';
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
  const { dateTime } = useDates();
</script>

<div class="logo"><Logo site="accounts" height="6rem" /></div>
<h1>{m.sign_in_heading()}</h1>
<p class="lede">{m.sign_in_lede()}</p>

{#if banned !== null}
  <Callout>
    {#if !banned.known}
      <p>{m.sign_in_banned()}</p>
    {:else}
      <p>
        {banned.until === null ? m.sign_in_banned_forever() : m.sign_in_banned_until({ date: dateTime(banned.until) })}
      </p>
      {#if banned.reason !== null}<p>{m.sign_in_banned_reason({ reason: banned.reason })}</p>{/if}
    {/if}
  </Callout>
{:else if failed}
  <Callout>{m.sign_in_failed()}</Callout>
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
          <Button type="submit">{m.sign_in_with({ provider: providerName(provider) })}</Button>
        </form>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .logo {
    margin-top: var(--mdr-space-6);
  }

  .lede,
  .stores {
    color: var(--mdr-color-text-muted);
  }

  /* A banned user's when and why, one under the other. */
  :global(.callout) p {
    margin: 0;
  }

  .providers {
    display: grid;
    gap: var(--mdr-space-3);
    max-width: 20rem;
    margin: var(--mdr-space-5) 0;
    padding: 0;
    list-style: none;
  }

  /* Each provider's button as wide as the list. */
  .providers :global(.button) {
    width: 100%;
  }
</style>
