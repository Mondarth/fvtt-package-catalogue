import { packageRelease } from '../../release.base.js';

/**
 * semantic-release configuration for the accounts: versioned and tagged from the commits that change them; the
 * release workflow then builds their container image from the tag.
 *
 * @type {import('semantic-release').Options}
 */
export default packageRelease({
  output: 'accounts-tag',
});
