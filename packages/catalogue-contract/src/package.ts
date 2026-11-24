/**
 * Packages: what Foundry VTT installs, named by type and id.
 */
import { z } from 'zod';

/** The kinds of package Foundry VTT installs. */
export const PackageType = z.enum(['module', 'system', 'world']);
export type PackageType = z.infer<typeof PackageType>;

/**
 * A package id, as a manifest gives it. Foundry VTT's own rule is looser than its advice, so this
 * accepts what published packages use, and nothing that could escape a URL path segment.
 */
export const PackageId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w.-]+$/, 'letters, digits, "_", "." and "-" only');

/** A package, named by its type and id. */
export const PackageRef = z.object({
  type: PackageType,
  id: PackageId,
});
export type PackageRef = z.infer<typeof PackageRef>;

/**
 * A package as the resolver names it: `<type>:<id>`, such as `module:midi-qol`.
 *
 * @param ref - The package
 * @returns Its key
 */
export function packageKey({ type, id }: PackageRef): string {
  return `${type}:${id}`;
}
