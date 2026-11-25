# @mondarth/design-tokens

Mondarth's design tokens, in the Design Tokens Community Group's
[format, 2025.10](https://www.designtokens.org/tr/2025.10/format/), and the CSS custom properties built from them, which
every Mondarth website styles itself with.

```css
@import '@mondarth/design-tokens/tokens.css';

.note {
  padding: var(--mdr-space-3) var(--mdr-space-4);
  background: var(--mdr-color-subtle);
  border-inline-start: var(--mdr-border-width-rule) solid var(--mdr-color-accent);
}
```

- `tokens.css`: every token as `--mdr-<path>`, light on `:root`; dark where the browser prefers it, unless the page asks
  for light; and either theme on an element marked `data-theme="light"` or `data-theme="dark"`.
- `tokens/`: the tokens themselves, and their resolver, `tokens/mondarth.resolver.json`.
- `brand/`: Mondarth's logos as SVG, one for each website (`mondarth.svg`, `catalogue.svg`, `aide.svg`,
  `accounts.svg`), and a square icon of each for favicons and small sizes (`<site>-icon.svg`), its emblem larger.
  `pnpm icons <site> <directory>` renders a site's favicons from its icon.

Use the theme's colours (`--mdr-color-*`), which name the palette's by what they are for, never the palette
(`--mdr-palette-*`) directly. In both themes, every text colour reaches WCAG's AA contrast on every background.

Built with [Terrazzo](https://terrazzo.app/). See the
[design system](https://mondarth.github.io/fvtt-package-catalogue/developer/design-system.html) documentation.

## AI Disclosure

This package was written with AI assistance (Claude Code). Every change is reviewed by a human before it is merged.
