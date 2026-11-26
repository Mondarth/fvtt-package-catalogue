<!--
  The bar along the top of every page: the language picker, and, at the far right, the way to sign in or register, at
  the accounts, which send the visitor back to this page; or, once signed in, the button showing the name the user is
  shown by, which opens their menu: their profile, their subscription and, for an admin, the admin pages, all at the
  accounts, and signing out, here.
-->
<script lang="ts">
  import { TopBar } from '@mondarth/ui';

  import { page } from '$app/state';
  import LanguagePicker from '#lib/components/LanguagePicker.svelte';
  import { m } from '#lib/paraglide/messages.js';

  interface Props {
    /** The signed-in user: the name they are shown by, and whether they are an admin; none while signed out. */
    user: { readonly name: string; readonly admin: boolean } | null;
    /** The accounts' address, as visitors reach it. */
    accounts: string;
  }

  let { user, accounts }: Props = $props();

  const account = $derived(
    user === null
      ? null
      : {
          name: user.name,
          label: m.profile_button_label({ name: user.name }),
          items: [
            { href: `${accounts}/profile`, label: m.profile_link() },
            { href: `${accounts}/subscription`, label: m.subscription_link() },
            ...(user.admin ? [{ href: `${accounts}/admin`, label: m.admin_link() }] : []),
            { action: '/sign-out', label: m.sign_out() },
          ],
        },
  );
  const signIn = $derived({
    href: `${accounts}/?next=${encodeURIComponent(page.url.href)}`,
    label: m.sign_in_register(),
  });
</script>

<TopBar label={m.workspace_label()} {account} {signIn}>
  <LanguagePicker />
</TopBar>
