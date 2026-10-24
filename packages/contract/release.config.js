import { packageRelease } from '../../release.base.js';

/** Releases the contract and publishes it to npm, through trusted publishing (no token). */
export default packageRelease({
  prepare: ['pnpm build'],
  // pnpm publishes natively; under trusted publishing it authenticates with the workflow's OIDC
  // token and attaches provenance itself.
  publishCmd: 'pnpm publish --no-git-checks',
  output: 'contract-tag',
});
