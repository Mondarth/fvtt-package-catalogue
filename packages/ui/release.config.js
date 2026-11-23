import { packageRelease } from '../../release.base.js';

/**
 * semantic-release configuration for the shared Svelte pieces: versioned and tagged from the commits that change them,
 * so that each application's release notes can say which it was built with. Private, used in the workspace alone, and
 * never published.
 *
 * @type {import('semantic-release').Options}
 */
export default packageRelease({
  output: 'ui-tag',
});
