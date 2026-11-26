# Design system

Every Mondarth website (mondarth.com, `accounts.`, `catalogue.` and, to come, `aide.`) is to look, read and behave as
one. The design system that makes them so has three levels, each built on the one before:

1. **Design tokens** (`packages/design-tokens`): every design decision (a colour, a space, a size of type, a duration)
   as a named token, and the CSS custom properties built from them. Framework-free, so any website can use them.
2. **Components** (`packages/ui`): the Svelte components the applications share, styled with the tokens alone.
   Storybook is where they are reviewed and tested (see [Components](#components)).
3. **Applications** (`apps/*`): their pages, built from the components. Each tests its own routes.

The design language itself (the colours and why, type, spacing, motion, wording and accessibility) is written down in
the components' Storybook, in its [Foundations][foundations] pages, which read the tokens themselves. This page says
how the system is built and changed; it does not repeat them.

## Design tokens

The tokens are written in the Design Tokens Community Group's
[format, 2025.10](https://www.designtokens.org/tr/2025.10/format/), under `packages/design-tokens/tokens/`:

`base/palette.tokens.json`
: The palette, from the logos: a ramp for each hue. Nothing styles itself with the palette directly. See
  [Colour][colour].

`base/size.tokens.json`
: Spacing, radii, border widths, layout widths, type and durations. See [Type][type], [Spacing][spacing] and
  [Motion][motion].

`theme/light.tokens.json`, `theme/dark.tokens.json`
: The theme's colours, by what they are for, each naming a colour of the palette.

`site/*.tokens.json`
: Each website's own colour, `color.site`: its emblem's.

`mondarth.resolver.json`
: The [resolver](https://www.designtokens.org/tr/2025.10/resolver/): the base set, then the `theme` modifier, `light`
  (the default) or `dark`, then the `site` modifier, `mondarth` (the default), `catalogue`, `aide` or `accounts`.

Styles use the theme's colours and the sizes, never the palette: a theme, such as to-do 56's, changes what the
colours name, and every page follows.

(branding)=

## Brand assets

The logos, and the colours taken from them, are shown in Storybook: the logos under [Brand / Logo][logo], the colours
in [Colour][colour].

### The logos as SVG

`packages/design-tokens/brand/` has every logo as SVG, drawn from the originals, so that it is sharp at any size:

`<site>.svg`
: The logo (`mondarth`, `catalogue`, `aide`, `accounts`). The crescent is two arcs, each the circle through its tips
  and its edge's furthest point; the gear is a ring of arcs with its teeth, fitted to the originals' gold, ending in
  its check mark and, at the bottom, an upright cut and a tooth; each emblem is drawn in its own colour, lighter at the
  top, outlined and detailed in the logos' ink (`#2a2a22`).

`<site>-icon.svg`
: The same, square, with the emblem larger, so that it is still told apart at 16 pixels: for favicons and other small
  sizes.

Their ids start `mdr-<file>-`, so that several can be inlined in one page. The package publishes them, for
mondarth.com too (`@mondarth/design-tokens/brand/<file>`).

### Favicons

Each application's favicons, in its `static/`, are rendered from its icon:

```shell
pnpm --filter @mondarth/design-tokens icons <site> <directory>
```

It writes `favicon.svg` (the icon), `favicon.ico` (16, 32 and 48 pixels), `apple-touch-icon.png` (180 pixels, on the
light theme's page, as iOS fills transparency with black), and `icon-192.png` and `icon-512.png`, which each
application's `site.webmanifest` names. They are rendered in Chromium, so they are what browsers draw. Run it when a
logo changes, and commit what it writes.

## Building the tokens

### The CSS

[Terrazzo](https://terrazzo.app/) builds `dist/tokens.css` from the resolver (`pnpm build`; installing the workspace
builds it too). Each token is a custom property named `--mdr-` and its path (`color.text` is `--mdr-color-text`),
with its description as a comment:

- `:root` has every token, light;
- where the browser prefers dark, the colours are dark, unless the page asks for light;
- an element marked `data-theme="light"` or `data-theme="dark"` takes that theme, whatever the browser prefers, and
  so does everything in it;
- an element marked `data-site` takes that site's colour (`--mdr-color-site`). Each application marks its pages'
  `<html>`: `data-site="catalogue"`, `data-site="accounts"`.

The applications take it through `@mondarth/ui/theme.css`, and style themselves with the tokens' own names alone.

### Testing contrast

The tests (`pnpm --filter @mondarth/design-tokens test`) read the built CSS and check, in both themes, every pairing
[Accessibility][accessibility] requires: text on every background at WCAG's AA, and controls' edges and the
focus ring at 3:1. A palette that would leave text unreadable fails CI.

### Changing the tokens

Change the JSON, `pnpm --filter @mondarth/design-tokens build`, and look at the applications (`pnpm dev`,
`pnpm dev:accounts`) in both themes. A new colour goes in the palette, a step of one of its ramps, and is named by what
it is for in both themes; a test pairs it with the backgrounds it is set on. A ramp's steps are even steps of OKLCH
lightness, at the hue of its logo colour, with the logo colour itself pinned at its step: keep new steps so, and keep
the logo colours where they are.

### mondarth.com

The Hugo site takes `tokens.css` from the published package, at a pinned version, and maps its theme's own variables
onto the tokens, so that it keeps its theme and wears Mondarth's colours.

(components)=

## Components

`packages/ui` holds the components every application shares, each shown, with how to use it, in the
[Storybook][storybook]: the page's frame, buttons, fields, checkboxes, dialogs, tables, badges, panels, notices and
callouts, the top bar and the user navigation menu (`UserMenu`: signing in, or the user's own menu), the language
picker, the logo, and the brand (`Brand`: the logo with "Mondarth" over the site's name, each in its colour as
text, `color.site-text`). Each is styled with the tokens alone (`--mdr-*`), never the
palette, and takes its words from the application, which translates them. They are native elements underneath (a
`<button>`, an `<input>` the page writes itself, a `<dialog>`), so that a page's forms post as plain HTML forms do.

`@mondarth/ui/theme.css` gives every page its base: the tokens, the page's colours and type, links in the accent with
a visible focus, and `.mdr-visually-hidden`, for words a sighted reader has from what is around them.

### Storybook

[Storybook](https://storybook.js.org/) is where the components are reviewed, and tested. Its preview loads the theme
(`@mondarth/ui/theme.css`, and so the tokens), and its toolbar chooses the theme (light, dark, or as the browser
prefers) and the site, as a page's `data-theme` and `data-site` would.

```shell
pnpm --filter @mondarth/ui storybook        # http://localhost:6006
```

Its **Foundations** pages (`packages/ui/src/foundations/*.mdx`) write down the design language: Introduction, Colour,
Type, Spacing, Motion, Wording and Accessibility. The colour, type, spacing and motion pages read the tokens' JSON
(`src/foundations/tokens.ts`, tested), so they show what the tokens are, never a copy of them. The Wording page is
the house style of every message the applications show; Accessibility is what every component and page must do, and
what is checked.

Each component has its stories beside it, `<Component>.stories.svelte`, written with
[addon-svelte-csf](https://github.com/storybookjs/addon-svelte-csf); a story it cannot express is written in plain
CSF, `<Component>.stories.ts`. The release publishes the Storybook with this documentation, at
[`storybook/`][storybook], where an application's own Storybook can
compose it.

### Testing components

Every story is a test (`@storybook/addon-vitest`), run by Vitest in Chromium:

- it renders, in the theme;
- its play function, where it has one, does what a person would, and checks what follows;
- [axe](https://github.com/dequelabs/axe-core) checks it, and an accessibility violation fails it
  (`a11y: { test: 'error' }` in `.storybook/preview.ts`).

```shell
pnpm --filter @mondarth/ui test             # the stories, and the unit tests
pnpm --filter @mondarth/ui test:coverage    # with the coverage gate
```

What is not a component (dates, language names) has unit tests, in happy-dom (`tests/`). Coverage counts both, with
Istanbul, which reads the Svelte components' statements as written. The applications do not test the shared
components again: they test their own routes, the components in them as they are used.

A new component comes with its stories, at least one with a play function, in light and dark.

[storybook]: https://mondarth.github.io/fvtt-package-catalogue/storybook/
[foundations]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-introduction--docs
[colour]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-colour--docs
[type]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-type--docs
[spacing]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-spacing--docs
[motion]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-motion--docs
[accessibility]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/foundations-accessibility--docs
[logo]: https://mondarth.github.io/fvtt-package-catalogue/storybook/?path=/docs/brand-logo--docs
