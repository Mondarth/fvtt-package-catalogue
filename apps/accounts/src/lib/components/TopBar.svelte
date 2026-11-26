<!--
  The workspace's bar along the top of every page: the language picker, and, at the far right, the way to sign in or
  register, or, once signed in, the button showing the name the user is shown by, which opens their menu: their
  profile, their subscription, the admin pages for an admin, and signing out.
-->
<script lang="ts">
  import { TopBar } from '@mondarth/ui';

  import { resolve } from '$app/paths';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The signed-in user: the name they are shown by, and whether they are an admin; none while signed out. */
    user: { readonly name: string; readonly admin: boolean } | null;
  }

  let { user }: Props = $props();

  const account = $derived(
    user === null
      ? null
      : {
          name: user.name,
          label: m.profile_button_label({ name: user.name }),
          items: [
            { href: resolve('/profile'), label: m.profile_link() },
            { href: resolve('/subscription'), label: m.subscription_link() },
            ...(user.admin ? [{ href: resolve('/admin'), label: m.admin_link() }] : []),
            { action: '/sign-out', label: m.sign_out() },
          ],
        },
  );
</script>

<TopBar label={m.workspace_label()} {account} signIn={{ href: resolve('/'), label: m.sign_in_register() }}>
  <LanguagePicker />
</TopBar>
