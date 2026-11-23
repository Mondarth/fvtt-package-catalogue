<!--
  The workspace's bar along the top of every page while signed in: its menu, the user's subscription and, for an admin,
  the admin pages, then the language picker, and, at the far right, the button to the user's profile, showing the name
  they are shown by.
-->
<script lang="ts">
  import { TopBar } from '@mondarth/ui';

  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The name the user is shown by: their nickname, or else their user id. */
    name: string;
    /** Whether they are an admin, who is offered the admin pages. */
    admin?: boolean;
  }

  let { name, admin = false }: Props = $props();

  const links = $derived([
    { href: resolve('/subscription'), label: m.subscription_link() },
    ...(admin ? [{ href: resolve('/admin'), label: m.admin_link() }] : []),
  ]);
</script>

<TopBar
  label={m.workspace_label()}
  {links}
  {name}
  profileHref={resolve('/profile')}
  profileLabel={m.profile_button_label({ name })}>
  <LanguagePicker />
</TopBar>
