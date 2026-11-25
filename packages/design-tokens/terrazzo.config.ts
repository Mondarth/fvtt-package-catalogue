import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';

/** Every variable is `--mdr-` and the token's path: `color.text` is `--mdr-color-text`. */
const variableName = (token: { id: string }) => `--mdr-${token.id.replaceAll('.', '-')}`;

/** The theme's colours alone change between light and dark; the site's colour is the same in both. */
const COLOURS = ['color.*'];
const SITE = ['color.site'];

/** Mondarth's websites, each the resolver's `site` context of the same name: `data-site` on a page chooses one. */
const SITES = ['mondarth', 'catalogue', 'aide', 'accounts'];

/**
 * Builds `dist/tokens.css` from the tokens (`tokens/mondarth.resolver.json`): every token on `:root`, light, as
 * mondarth.com; dark where the browser prefers it, unless the page asks for light (`data-theme="light"` on any
 * element); either theme where a page asks for it, on whatever it marks; and each site's colour where a page says which
 * site it is (`data-site`).
 */
export default defineConfig({
  tokens: ['./tokens/mondarth.resolver.json'],
  outDir: './dist/',
  plugins: [
    css({
      filename: 'tokens.css',
      variableName,
      legacyHex: true,
      permutations: [
        {
          input: { theme: 'light' },
          prepare: contents => `:root {\n  color-scheme: light dark;\n  ${contents}\n}`,
        },
        {
          input: { theme: 'dark' },
          include: COLOURS,
          exclude: SITE,
          prepare: contents =>
            `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n    ${contents}\n  }\n}`,
        },
        {
          input: { theme: 'light' },
          include: COLOURS,
          exclude: SITE,
          prepare: contents => `[data-theme='light'] {\n  color-scheme: light;\n  ${contents}\n}`,
        },
        {
          input: { theme: 'dark' },
          include: COLOURS,
          exclude: SITE,
          prepare: contents => `[data-theme='dark'] {\n  color-scheme: dark;\n  ${contents}\n}`,
        },
        ...SITES.map(site => ({
          input: { theme: 'light', site },
          include: SITE,
          prepare: (contents: string) => `[data-site='${site}'] {\n  ${contents}\n}`,
        })),
      ],
    }),
  ],
});
