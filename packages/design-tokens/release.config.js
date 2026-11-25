import { packageRelease } from '../../release.base.js';

/**
 * Releases the design tokens and publishes them to npm, through trusted publishing (no token): mondarth.com, which is
 * not in this workspace, takes its CSS from the published package.
 */
export default packageRelease({
  prepare: ['pnpm build'],
  publishCmd: 'pnpm publish --no-git-checks',
  output: 'design-tokens-tag',
});
