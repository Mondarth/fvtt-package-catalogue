<!--
  The bar along the top of every page while signed in: the user's subscription and, for an admin, the admin pages,
  both at the accounts, then the language picker, and, at the far right, the button to the user's profile, at the
  accounts too, showing the name they are shown by.
-->
<script lang="ts">
  import { TopBar } from '@mondarth/ui';

  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The name the user is shown by: their nickname, or else their handle. */
    name: string;
    /** Whether they are an admin, who is offered the admin pages. */
    admin?: boolean;
    /** The accounts' address, as visitors reach it. */
    accounts: string;
  }

  let { name, admin = false, accounts }: Props = $props();

  const links = $derived([
    { href: `${accounts}/subscription`, label: m.subscription_link() },
    ...(admin ? [{ href: `${accounts}/admin`, label: m.admin_link() }] : []),
  ]);
</script>

<TopBar
  label={m.workspace_label()}
  {links}
  {name}
  profileHref={`${accounts}/profile`}
  profileLabel={m.profile_button_label({ name })}>
  <LanguagePicker />
</TopBar>
