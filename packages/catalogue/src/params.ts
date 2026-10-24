import { PackageType } from '@mondarth/fvtt-package-catalogue-contract';
import { defineParams } from '@sveltejs/kit/params';

/** The route parameters with a schema of their own: `[type=packageType]` is `module`, `system` or `world`. */
export const params = defineParams({
  packageType: PackageType,
});
