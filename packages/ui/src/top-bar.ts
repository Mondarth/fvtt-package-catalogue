/** A link of the top bar's menu. */
export interface TopBarLink {
  readonly href: string;
  readonly label: string;
}

/**
 * An entry of the profile menu: a link, or an action posted as a form, such as signing out, which a link must not do.
 */
export type ProfileMenuItem =
  { readonly href: string; readonly label: string } | { readonly action: string; readonly label: string };

/** The signed-in user, as the top bar shows them: the button to their menu, and what is in it. */
export interface TopBarAccount {
  /** The name they are shown by, on the button. */
  readonly name: string;
  /** What the button says to a screen reader, naming them. */
  readonly label: string;
  /** The menu's entries, in order. */
  readonly items: readonly ProfileMenuItem[];
}

/** Whether an entry of the profile menu is an action, posted as a form. */
export const isAction = (item: ProfileMenuItem): item is { readonly action: string; readonly label: string } =>
  'action' in item;
