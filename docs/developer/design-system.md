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
: The palette, from the logos (see [Branding](#branding)): turquoise, gold and orange, slate greys, and red, green and
  blue. Nothing styles itself with the palette directly.

`base/size.tokens.json`
: Spacing (`space.1` to `space.7`, 0.25rem to 3rem), radii, border widths, the widths of a page's text and of a dialog,
  font families, sizes, weights and line heights, and durations.

`theme/light.tokens.json`, `theme/dark.tokens.json`
: The theme's colours, by what they are for (see [what each colour is for](#what-each-colour-is-for)), each naming a
  colour of the palette.

`site/*.tokens.json`
: Each website's own colour, `color.site`: its emblem's.

`mondarth.resolver.json`
: The [resolver](https://www.designtokens.org/tr/2025.10/resolver/): the base set, then the `theme` modifier, `light`
  (the default) or `dark`, then the `site` modifier, `mondarth` (the default), `catalogue`, `aide` or `accounts`.

Styles use the theme's colours and the sizes, never the palette: a theme, such as to-do 56's, changes what the
colours name, and every page follows.

(branding)=

## Branding

Mondarth's colours come from its logos. Every logo has the same turquoise crescent and gold gear, around an emblem of
its site's own:

```{raw} html
<div class="mdr-logos"><figure><img src="../_static/branding/mondarth.webp" alt="Mondarth logo: the crescent, the gear and an orange d20" width="120"><figcaption>mondarth.com</figcaption></figure><figure><img src="../_static/branding/mondarth-catalog.webp" alt="The catalogue logo: the crescent, the gear and a gold book with a key" width="120"><figcaption>Catalogue</figcaption></figure><figure><img src="../_static/branding/mondarth-aide.webp" alt="The AIDE logo: the crescent, the gear and a turquoise scroll and quill" width="120"><figcaption>AIDE</figcaption></figure><figure><img src="../_static/branding/mondarth-accounts.webp" alt="The accounts logo: the crescent, the gear and a blue ID card" width="120"><figcaption>Accounts</figcaption></figure></div>
```

- **The crescent**, `#2ff9e3`, and **the gear**, `#efbb47`, are in every logo. Both are very light: on black they reach
  15.8:1 and 11.9:1, on white only 1.3:1 and 1.8:1. So in the dark theme they are used as they are, and in the light
  theme anything read takes a deeper shade of their hue.
- **Each site's emblem** has a colour of its own: mondarth.com's d20 orange (`#f3891c`), the catalogue's book gold,
  AIDE's scroll turquoise, and the accounts' ID card blue. Each emblem is one colour, lighter at the top, outlined and
  detailed in the logos' dark ink.

The accounts' logo was drawn from AIDE's, its scroll and quill replaced with an ID card in the blue ramp's lighter
shades (`#a4daff` to `#2e8ee6`).

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

### The palette

Each ramp keeps the hue of its logo colour and steps lightness evenly in OKLCH, so that a step weighs about the same
in every hue. The outlined swatches are the logo colours themselves, pinned at their steps. The greys are a slate
tinted toward the crescent.

```{raw} html
<div class="mdr-ramps"><div class="mdr-ramp"><span class="mdr-ramp-name">Turquoise</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#dffffa;color:#11191a" title="palette.turquoise.50"><b>50</b>#dffffa</span><span class="mdr-swatch" style="background:#aefff4;color:#11191a" title="palette.turquoise.100"><b>100</b>#aefff4</span><span class="mdr-swatch mdr-pinned" style="background:#2ff9e3;color:#11191a" title="palette.turquoise.200"><b>200</b>#2ff9e3</span><span class="mdr-swatch" style="background:#06e2d0;color:#11191a" title="palette.turquoise.300"><b>300</b>#06e2d0</span><span class="mdr-swatch" style="background:#02c8b9;color:#11191a" title="palette.turquoise.400"><b>400</b>#02c8b9</span><span class="mdr-swatch" style="background:#02a99b;color:#11191a" title="palette.turquoise.500"><b>500</b>#02a99b</span><span class="mdr-swatch" style="background:#04877c;color:#ffffff" title="palette.turquoise.600"><b>600</b>#04877c</span><span class="mdr-swatch" style="background:#036961;color:#ffffff" title="palette.turquoise.700"><b>700</b>#036961</span><span class="mdr-swatch" style="background:#02514a;color:#ffffff" title="palette.turquoise.800"><b>800</b>#02514a</span><span class="mdr-swatch" style="background:#022b27;color:#ffffff" title="palette.turquoise.900"><b>900</b>#022b27</span><span class="mdr-swatch" style="background:#001c19;color:#ffffff" title="palette.turquoise.950"><b>950</b>#001c19</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Gold</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#fff6e5;color:#11191a" title="palette.gold.50"><b>50</b>#fff6e5</span><span class="mdr-swatch" style="background:#ffeac3;color:#11191a" title="palette.gold.100"><b>100</b>#ffeac3</span><span class="mdr-swatch" style="background:#fed57f;color:#11191a" title="palette.gold.200"><b>200</b>#fed57f</span><span class="mdr-swatch mdr-pinned" style="background:#efbb47;color:#11191a" title="palette.gold.300"><b>300</b>#efbb47</span><span class="mdr-swatch" style="background:#daa415;color:#11191a" title="palette.gold.400"><b>400</b>#daa415</span><span class="mdr-swatch" style="background:#b98a07;color:#11191a" title="palette.gold.500"><b>500</b>#b98a07</span><span class="mdr-swatch" style="background:#946d03;color:#ffffff" title="palette.gold.600"><b>600</b>#946d03</span><span class="mdr-swatch" style="background:#745501;color:#ffffff" title="palette.gold.700"><b>700</b>#745501</span><span class="mdr-swatch" style="background:#594000;color:#ffffff" title="palette.gold.800"><b>800</b>#594000</span><span class="mdr-swatch" style="background:#302101;color:#ffffff" title="palette.gold.900"><b>900</b>#302101</span><span class="mdr-swatch" style="background:#201500;color:#ffffff" title="palette.gold.950"><b>950</b>#201500</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Orange</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#fef5ee;color:#11191a" title="palette.orange.50"><b>50</b>#fef5ee</span><span class="mdr-swatch" style="background:#fee8d8;color:#11191a" title="palette.orange.100"><b>100</b>#fee8d8</span><span class="mdr-swatch" style="background:#ffd0ae;color:#11191a" title="palette.orange.200"><b>200</b>#ffd0ae</span><span class="mdr-swatch" style="background:#feb073;color:#11191a" title="palette.orange.300"><b>300</b>#feb073</span><span class="mdr-swatch mdr-pinned" style="background:#f3891c;color:#11191a" title="palette.orange.400"><b>400</b>#f3891c</span><span class="mdr-swatch" style="background:#d77508;color:#11191a" title="palette.orange.500"><b>500</b>#d77508</span><span class="mdr-swatch" style="background:#ad5d00;color:#ffffff" title="palette.orange.600"><b>600</b>#ad5d00</span><span class="mdr-swatch" style="background:#884801;color:#ffffff" title="palette.orange.700"><b>700</b>#884801</span><span class="mdr-swatch" style="background:#683602;color:#ffffff" title="palette.orange.800"><b>800</b>#683602</span><span class="mdr-swatch" style="background:#3a1b00;color:#ffffff" title="palette.orange.900"><b>900</b>#3a1b00</span><span class="mdr-swatch" style="background:#271100;color:#ffffff" title="palette.orange.950"><b>950</b>#271100</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Slate</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#ffffff;color:#11191a" title="palette.slate.0"><b>0</b>#ffffff</span><span class="mdr-swatch" style="background:#f2f8f9;color:#11191a" title="palette.slate.50"><b>50</b>#f2f8f9</span><span class="mdr-swatch" style="background:#e8eeef;color:#11191a" title="palette.slate.100"><b>100</b>#e8eeef</span><span class="mdr-swatch" style="background:#d2dddf;color:#11191a" title="palette.slate.200"><b>200</b>#d2dddf</span><span class="mdr-swatch" style="background:#bcc6c8;color:#11191a" title="palette.slate.300"><b>300</b>#bcc6c8</span><span class="mdr-swatch" style="background:#a6b0b2;color:#11191a" title="palette.slate.400"><b>400</b>#a6b0b2</span><span class="mdr-swatch" style="background:#8a9496;color:#11191a" title="palette.slate.500"><b>500</b>#8a9496</span><span class="mdr-swatch" style="background:#6d7778;color:#ffffff" title="palette.slate.600"><b>600</b>#6d7778</span><span class="mdr-swatch" style="background:#535d5e;color:#ffffff" title="palette.slate.700"><b>700</b>#535d5e</span><span class="mdr-swatch" style="background:#3e4749;color:#ffffff" title="palette.slate.800"><b>800</b>#3e4749</span><span class="mdr-swatch" style="background:#273031;color:#ffffff" title="palette.slate.850"><b>850</b>#273031</span><span class="mdr-swatch" style="background:#1d2627;color:#ffffff" title="palette.slate.900"><b>900</b>#1d2627</span><span class="mdr-swatch" style="background:#11191a;color:#ffffff" title="palette.slate.950"><b>950</b>#11191a</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Red</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#fff4f3;color:#11191a" title="palette.red.50"><b>50</b>#fff4f3</span><span class="mdr-swatch" style="background:#fee7e4;color:#11191a" title="palette.red.100"><b>100</b>#fee7e4</span><span class="mdr-swatch" style="background:#fecdc8;color:#11191a" title="palette.red.200"><b>200</b>#fecdc8</span><span class="mdr-swatch" style="background:#ffaba3;color:#11191a" title="palette.red.300"><b>300</b>#ffaba3</span><span class="mdr-swatch" style="background:#ff847d;color:#11191a" title="palette.red.400"><b>400</b>#ff847d</span><span class="mdr-swatch" style="background:#e8605b;color:#11191a" title="palette.red.500"><b>500</b>#e8605b</span><span class="mdr-swatch" style="background:#c43f3e;color:#ffffff" title="palette.red.600"><b>600</b>#c43f3e</span><span class="mdr-swatch" style="background:#a51e24;color:#ffffff" title="palette.red.700"><b>700</b>#a51e24</span><span class="mdr-swatch" style="background:#860012;color:#ffffff" title="palette.red.800"><b>800</b>#860012</span><span class="mdr-swatch" style="background:#4b0106;color:#ffffff" title="palette.red.900"><b>900</b>#4b0106</span><span class="mdr-swatch" style="background:#340003;color:#ffffff" title="palette.red.950"><b>950</b>#340003</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Green</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#e5ffe9;color:#11191a" title="palette.green.50"><b>50</b>#e5ffe9</span><span class="mdr-swatch" style="background:#c1ffcd;color:#11191a" title="palette.green.100"><b>100</b>#c1ffcd</span><span class="mdr-swatch" style="background:#8cf6a5;color:#11191a" title="palette.green.200"><b>200</b>#8cf6a5</span><span class="mdr-swatch" style="background:#75df8f;color:#11191a" title="palette.green.300"><b>300</b>#75df8f</span><span class="mdr-swatch" style="background:#5dc879;color:#11191a" title="palette.green.400"><b>400</b>#5dc879</span><span class="mdr-swatch" style="background:#3eab5e;color:#11191a" title="palette.green.500"><b>500</b>#3eab5e</span><span class="mdr-swatch" style="background:#0e8c41;color:#ffffff" title="palette.green.600"><b>600</b>#0e8c41</span><span class="mdr-swatch" style="background:#046e30;color:#ffffff" title="palette.green.700"><b>700</b>#046e30</span><span class="mdr-swatch" style="background:#025424;color:#ffffff" title="palette.green.800"><b>800</b>#025424</span><span class="mdr-swatch" style="background:#012d10;color:#ffffff" title="palette.green.900"><b>900</b>#012d10</span><span class="mdr-swatch" style="background:#001e08;color:#ffffff" title="palette.green.950"><b>950</b>#001e08</span></div></div><div class="mdr-ramp"><span class="mdr-ramp-name">Blue</span><div class="mdr-swatches"><span class="mdr-swatch" style="background:#f0f8ff;color:#11191a" title="palette.blue.50"><b>50</b>#f0f8ff</span><span class="mdr-swatch" style="background:#deefff;color:#11191a" title="palette.blue.100"><b>100</b>#deefff</span><span class="mdr-swatch" style="background:#bddffe;color:#11191a" title="palette.blue.200"><b>200</b>#bddffe</span><span class="mdr-swatch" style="background:#8ecbff;color:#11191a" title="palette.blue.300"><b>300</b>#8ecbff</span><span class="mdr-swatch mdr-pinned" style="background:#60b6fa;color:#11191a" title="palette.blue.400"><b>400</b>#60b6fa</span><span class="mdr-swatch" style="background:#4299dc;color:#11191a" title="palette.blue.500"><b>500</b>#4299dc</span><span class="mdr-swatch" style="background:#1c7abb;color:#ffffff" title="palette.blue.600"><b>600</b>#1c7abb</span><span class="mdr-swatch" style="background:#015f98;color:#ffffff" title="palette.blue.700"><b>700</b>#015f98</span><span class="mdr-swatch" style="background:#004975;color:#ffffff" title="palette.blue.800"><b>800</b>#004975</span><span class="mdr-swatch" style="background:#012641;color:#ffffff" title="palette.blue.900"><b>900</b>#012641</span><span class="mdr-swatch" style="background:#01192c;color:#ffffff" title="palette.blue.950"><b>950</b>#01192c</span></div></div></div>
```

### What each colour is for

```{raw} html
<div class="mdr-table"><table><thead><tr><th>Token</th><th>For</th><th>Light</th><th>Dark</th></tr></thead><tbody><tr><td><code>color.background</code></td><td>The page</td><td><span class="mdr-chip" style="background:#f2f8f9"></span><code>slate.50</code></td><td><span class="mdr-chip" style="background:#11191a"></span><code>slate.950</code></td></tr><tr><td><code>color.surface</code></td><td>Cards, dialogs, fields</td><td><span class="mdr-chip" style="background:#ffffff"></span><code>slate.0</code></td><td><span class="mdr-chip" style="background:#1d2627"></span><code>slate.900</code></td></tr><tr><td><code>color.subtle</code></td><td>Notes, table headers, quiet dividers</td><td><span class="mdr-chip" style="background:#e8eeef"></span><code>slate.100</code></td><td><span class="mdr-chip" style="background:#273031"></span><code>slate.850</code></td></tr><tr><td><code>color.text</code></td><td>Text</td><td><span class="mdr-chip" style="background:#11191a"></span><code>slate.950</code></td><td><span class="mdr-chip" style="background:#e8eeef"></span><code>slate.100</code></td></tr><tr><td><code>color.text-muted</code></td><td>Hints, dates, captions</td><td><span class="mdr-chip" style="background:#535d5e"></span><code>slate.700</code></td><td><span class="mdr-chip" style="background:#a6b0b2"></span><code>slate.400</code></td></tr><tr><td><code>color.text-on-accent</code></td><td>Text on the accent</td><td><span class="mdr-chip" style="background:#f2f8f9"></span><code>slate.50</code></td><td><span class="mdr-chip" style="background:#11191a"></span><code>slate.950</code></td></tr><tr><td><code>color.accent</code></td><td>Links, the current page, what is chosen</td><td><span class="mdr-chip" style="background:#036961"></span><code>turquoise.700</code></td><td><span class="mdr-chip" style="background:#2ff9e3"></span><code>turquoise.200</code></td></tr><tr><td><code>color.action</code></td><td>The main action: one gold button a view</td><td><span class="mdr-chip" style="background:#efbb47"></span><code>gold.300</code></td><td><span class="mdr-chip" style="background:#efbb47"></span><code>gold.300</code></td></tr><tr><td><code>color.text-on-action</code></td><td>Text on the main action</td><td><span class="mdr-chip" style="background:#11191a"></span><code>slate.950</code></td><td><span class="mdr-chip" style="background:#11191a"></span><code>slate.950</code></td></tr><tr><td><code>color.border</code></td><td>Dividers, the edges of surfaces</td><td><span class="mdr-chip" style="background:#d2dddf"></span><code>slate.200</code></td><td><span class="mdr-chip" style="background:#3e4749"></span><code>slate.800</code></td></tr><tr><td><code>color.border-strong</code></td><td>The edges of controls</td><td><span class="mdr-chip" style="background:#6d7778"></span><code>slate.600</code></td><td><span class="mdr-chip" style="background:#8a9496"></span><code>slate.500</code></td></tr><tr><td><code>color.focus</code></td><td>The focus ring</td><td><span class="mdr-chip" style="background:#04877c"></span><code>turquoise.600</code></td><td><span class="mdr-chip" style="background:#06e2d0"></span><code>turquoise.300</code></td></tr><tr><td><code>color.danger</code></td><td>Errors; what cannot be undone</td><td><span class="mdr-chip" style="background:#a51e24"></span><code>red.700</code></td><td><span class="mdr-chip" style="background:#ffaba3"></span><code>red.300</code></td></tr><tr><td><code>color.warning</code></td><td>What needs care</td><td><span class="mdr-chip" style="background:#884801"></span><code>orange.700</code></td><td><span class="mdr-chip" style="background:#feb073"></span><code>orange.300</code></td></tr><tr><td><code>color.success</code></td><td>What is done</td><td><span class="mdr-chip" style="background:#046e30"></span><code>green.700</code></td><td><span class="mdr-chip" style="background:#75df8f"></span><code>green.300</code></td></tr><tr><td><code>color.info</code></td><td>What is worth knowing</td><td><span class="mdr-chip" style="background:#015f98"></span><code>blue.700</code></td><td><span class="mdr-chip" style="background:#8ecbff"></span><code>blue.300</code></td></tr></tbody></table></div>
```

- **Turquoise is the accent.** The crescent is in every logo, so links, the current page and the focus ring are
  turquoise: the crescent itself in the dark theme, and a deep teal (`turquoise.700`) in the light.
- **Gold is the main action.** The gear's gold fills the main button, in both themes, always with dark ink on it. One
  gold button a view keeps it meaningful.
- **Orange is a warning**, so that it does not compete with the gold; it stays the d20's. Success is green and info
  blue, each far enough in hue from the turquoise not to be taken for it.
- **The site's colour** (`color.site`) marks which site a page is on, beside its logo or along an edge, the same in
  both themes. Gold and turquoise are too light to read on a light page, so it is never text, and never the only sign
  of anything.

### Contrast

The lowest ratio of each colour against the page, a surface and a subtle background, in each theme. Text needs 4.5:1
(WCAG AA), and the focus ring and controls' edges 3:1. The tests check each of these.

```{raw} html
<div class="mdr-table"><table><thead><tr><th>Colour</th><th>Light</th><th>Dark</th></tr></thead><tbody><tr><td>Text</td><td class="mdr-num">15.20</td><td class="mdr-num">11.53</td></tr><tr><td>Muted text</td><td class="mdr-num">5.79</td><td class="mdr-num">6.10</td></tr><tr><td>The accent</td><td class="mdr-num">5.60</td><td class="mdr-num">10.16</td></tr><tr><td>Danger</td><td class="mdr-num">6.37</td><td class="mdr-num">7.47</td></tr><tr><td>Warning</td><td class="mdr-num">6.02</td><td class="mdr-num">7.51</td></tr><tr><td>Success</td><td class="mdr-num">5.46</td><td class="mdr-num">8.18</td></tr><tr><td>Info</td><td class="mdr-num">5.79</td><td class="mdr-num">7.81</td></tr><tr><td>Text on the main action</td><td class="mdr-num">10.08</td><td class="mdr-num">10.08</td></tr><tr><td>The focus ring (3:1)</td><td class="mdr-num">3.76</td><td class="mdr-num">8.24</td></tr><tr><td>The edges of controls (3:1)</td><td class="mdr-num">3.93</td><td class="mdr-num">4.35</td></tr></tbody></table></div>
```

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

The applications take it through `@mondarth/ui/theme.css`, which keeps the names they used before (`--bg`, `--fg`,
`--muted`, `--accent`, `--note-bg`) as aliases of the tokens, while their styles move to the tokens' own.

### Testing contrast

The tests (`pnpm --filter @mondarth/design-tokens test`) read the built CSS and check, in both themes, that every text
colour (text, muted text, the accent and the statuses) reaches WCAG's AA, 4.5:1, on every background (the page, a
surface, and a subtle background), as do the text on the accent and on the gold of the main action; and that controls' edges and the focus ring reach
3:1. A palette that would leave text unreadable fails CI.

### Changing the tokens

Change the JSON, `pnpm --filter @mondarth/design-tokens build`, and look at the applications (`pnpm dev`,
`pnpm dev:accounts`) in both themes. A new colour goes in the palette, a step of one of its ramps, and is named by what
it is for in both themes; a test pairs it with the backgrounds it is set on. A ramp's steps are even steps of OKLCH
lightness, at the hue of its logo colour, with the logo colour itself pinned at its step: keep new steps so, and keep
the logo colours where they are.

### mondarth.com

The Hugo site takes `tokens.css` from the published package, at a pinned version, and maps its theme's own variables
onto the tokens, so that it keeps its theme and wears Mondarth's colours.
