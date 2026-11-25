# Design system

Every Mondarth website (mondarth.com, `accounts.`, `catalogue.` and, to come, `aide.`) is to look, read and behave as
one. The design system that makes them so has three levels, each built on the one before:

1. **Design tokens** (`packages/design-tokens`): every design decision (a colour, a space, a size of type, a duration)
   as a named token, and the CSS custom properties built from them. Framework-free, so any website can use them.
2. **Components** (`packages/ui`): the Svelte components the applications share, styled with the tokens alone.
   Storybook is to become where they are reviewed and tested.
3. **Applications** (`apps/*`): their pages, built from the components. Each tests its own routes.

## Design tokens

The tokens are written in the Design Tokens Community Group's
[format, 2025.10](https://www.designtokens.org/tr/2025.10/format/), under `packages/design-tokens/tokens/`:

`base/palette.tokens.json`
: The palette: warm neutrals from paper white to ink, Mondarth's rust accent, and red, amber, green and blue. Nothing
  styles itself with the palette directly.

`base/size.tokens.json`
: Spacing (`space.1` to `space.7`, 0.25rem to 3rem), radii, border widths, the widths of a page's text and of a dialog,
  font families, sizes, weights and line heights, and durations.

`theme/light.tokens.json`, `theme/dark.tokens.json`
: The theme's colours, by what they are for (`color.background`, `color.surface`, `color.subtle`, `color.text`,
  `color.text-muted`, `color.accent`, `color.border`, `color.border-strong`, `color.focus`, and the statuses
  `color.danger`, `warning`, `success` and `info`), each naming a colour of the palette.

`mondarth.resolver.json`
: The [resolver](https://www.designtokens.org/tr/2025.10/resolver/): the base set, then the `theme` modifier, `light`
  (the default) or `dark`.

Styles use the theme's colours and the sizes, never the palette: a theme, such as to-do 56's, changes what the
colours name, and every page follows.

### The CSS

[Terrazzo](https://terrazzo.app/) builds `dist/tokens.css` from the resolver (`pnpm build`; installing the workspace
builds it too). Each token is a custom property named `--mdr-` and its path (`color.text` is `--mdr-color-text`),
with its description as a comment:

- `:root` has every token, light;
- where the browser prefers dark, the colours are dark, unless the page asks for light;
- an element marked `data-theme="light"` or `data-theme="dark"` takes that theme, whatever the browser prefers, and
  so does everything in it.

The applications take it through `@mondarth/ui/theme.css`, which keeps the names they used before (`--bg`, `--fg`,
`--muted`, `--accent`, `--note-bg`) as aliases of the tokens, while their styles move to the tokens' own.

### Contrast

The tests (`pnpm --filter @mondarth/design-tokens test`) read the built CSS and check, in both themes, that every text
colour (text, muted text, the accent and the statuses) reaches WCAG's AA, 4.5:1, on every background (the page, a
surface, and a subtle background), as does the text on the accent; and that controls' edges and the focus ring reach
3:1. A palette that would leave text unreadable fails CI.

### Changing the tokens

Change the JSON, `pnpm --filter @mondarth/design-tokens build`, and look at the applications (`pnpm dev`,
`pnpm dev:accounts`) in both themes. A new colour goes in the palette, and is named by what it is for in both themes;
a test pairs it with the backgrounds it is set on.

### mondarth.com

The Hugo site takes `tokens.css` from the published package, at a pinned version, and maps its theme's own variables
onto the tokens, so that it keeps its theme and wears Mondarth's colours.
