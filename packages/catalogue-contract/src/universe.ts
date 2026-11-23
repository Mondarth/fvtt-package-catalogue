/**
 * The universe: every release the resolver may choose from, and what could not be fetched.
 */
import { z } from 'zod';

import { CoreRelease } from './core.js';
import { Release } from './release.js';

/** Everything the resolver may choose from. */
export const Universe = z.object({
  core: z.array(CoreRelease),
  releases: z.array(Release),
});
export type Universe = z.infer<typeof Universe>;

/**
 * Something a source could not fetch or read: `http`, the server answered with an error;
 * `network`, it could not be reached; `budget`, the request budget ran out; `invalid`, the answer
 * could not be read.
 */
export const SourceGap = z.object({
  source: z.string().min(1),
  url: z.string().min(1),
  reason: z.enum(['http', 'network', 'budget', 'invalid']),
  status: z.int().exactOptional(),
  /** The package's key, `<type>:<id>`. */
  package: z.string().exactOptional(),
  version: z.string().exactOptional(),
});
export type SourceGap = z.infer<typeof SourceGap>;
