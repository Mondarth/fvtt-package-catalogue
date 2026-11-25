import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';

/** Every variable is `--mdr-` and the token's path: `color.text` is `--mdr-color-text`. */
const variableName = (token: { id: string }) => `--mdr-${token.id.replaceAll('.', '-')}`;

/** The theme's colours alone change between light and dark. */
const COLOURS = ['color.*'];

/**
 * Builds `dist/tokens.css` from the tokens (`tokens/mondarth.resolver.json`): every token on `:root`, light; dark where
 * the browser prefers it, unless the page asks for light (`data-theme="light"` on any element); and either theme where a
 * page asks for it, on whatever it marks.
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
          prepare: contents =>
            `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n    ${contents}\n  }\n}`,
        },
        {
          input: { theme: 'light' },
          include: COLOURS,
          prepare: contents => `[data-theme='light'] {\n  color-scheme: light;\n  ${contents}\n}`,
        },
        {
          input: { theme: 'dark' },
          include: COLOURS,
          prepare: contents => `[data-theme='dark'] {\n  color-scheme: dark;\n  ${contents}\n}`,
        },
      ],
    }),
  ],
});
