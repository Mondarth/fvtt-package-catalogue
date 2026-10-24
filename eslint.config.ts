import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  // Generated output; not ours to lint.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
      '**/drizzle/meta/**',
      '**/src/lib/paraglide/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'docs/_build/**',
      'releases/**',
    ],
  },
  { languageOptions: { globals: { ...globals.node } } },
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: ts.parser },
    },
  },
  // The packages' public surface is documented in TSDoc.
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        { publicOnly: true, require: { FunctionDeclaration: true }, contexts: ['TSInterfaceDeclaration'] },
      ],
    },
  },
  // Configuration files that a tool requires in JavaScript are not type-checked.
  {
    files: ['**/*.js'],
    extends: [ts.configs.disableTypeChecked],
  },
);
