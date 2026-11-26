import type { Decorator, Preview } from '@storybook/svelte-vite';

// The theme every application uses: the design tokens' CSS, and the page's base.
import '../src/theme.css';

/** Light or dark, as a page asks for it with `data-theme`; or as the browser prefers, when neither is chosen. */
const THEMES = ['system', 'light', 'dark'] as const;
/** Which website, as a page says with `data-site`, for its colour (`--mdr-color-site`). */
const SITES = ['mondarth', 'catalogue', 'aide', 'accounts'] as const;

/** Marks the document as an application's root layout does, with the theme and the site chosen in the toolbar. */
const asPage: Decorator = (story, context) => {
  const root = document.documentElement;
  const theme = String(context.globals.theme ?? 'system');
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-site', String(context.globals.site ?? 'mondarth'));
  return story();
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Light or dark',
      toolbar: { title: 'Theme', icon: 'mirror', items: [...THEMES], dynamicTitle: true },
    },
    site: {
      description: 'Which Mondarth website',
      toolbar: { title: 'Site', icon: 'globe', items: [...SITES], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'system', site: 'mondarth' },
  decorators: [asPage],
  parameters: {
    options: {
      storySort: {
        order: [
          'Foundations',
          ['Introduction', 'Colour', 'Type', 'Spacing', 'Motion', 'Wording', 'Accessibility'],
          'Brand',
          'Layout',
          'Actions',
          'Forms',
          'Overlays',
          'Data',
          'Feedback',
          'Navigation',
        ],
      },
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // An accessibility violation fails the story's test, and so CI.
    a11y: { test: 'error' },
  },
};

export default preview;
