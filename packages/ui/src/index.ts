/**
 * The Svelte pieces Mondarth's applications share, so that each looks, and reads, as one with the others: the logo, the
 * top bar, the language picker, notices and callouts. Each takes its words from the application, which translates them,
 * so that this package holds none of its own.
 *
 * Dates written as each reader writes them are in `@mondarth/ui/dates`, language names in `@mondarth/ui/language`, and
 * the theme's colours, as CSS custom properties, in `@mondarth/ui/theme.css`.
 *
 * @packageDocumentation
 */
export { default as Callout } from './Callout.svelte';
export { default as LanguagePicker } from './LanguagePicker.svelte';
export { default as Logo } from './Logo.svelte';
export { default as Notice } from './Notice.svelte';
export { default as TopBar } from './TopBar.svelte';
export type { TopBarLink } from './top-bar.js';
