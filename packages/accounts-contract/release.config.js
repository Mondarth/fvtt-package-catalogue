import { packageRelease } from '../../release.base.js';

/**
 * semantic-release configuration for the accounts contract: versioned and tagged from the commits that change it, so
 * that the accounts app and the applications using it, deployed apart, can say which contract each speaks. It is
 * private, used in the workspace alone, and never published.
 *
 * @type {import('semantic-release').Options}
 */
export default packageRelease({
  output: 'accounts-contract-tag',
});
