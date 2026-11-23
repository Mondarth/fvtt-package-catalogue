import { packageRelease } from '../../release.base.js';

/**
 * Releases the catalogue. It is not published to a registry: the release workflow builds its container image from the
 * release's tag and pushes it to the GitHub Container Registry. The version the release sets in package.json is the one
 * the image reports (`GET /api/v1/status`).
 */
export default packageRelease({
  output: 'catalogue-tag',
});
