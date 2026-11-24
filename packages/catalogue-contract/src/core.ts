/**
 * Core releases: the builds of Foundry VTT itself.
 */
import { z } from 'zod';

/** The release channels of Foundry VTT's builds. */
export const CoreChannel = z.enum(['stable', 'testing', 'development', 'prototype']);
export type CoreChannel = z.infer<typeof CoreChannel>;

/** One Foundry VTT build. */
export const CoreRelease = z.object({
  /** `<generation>.<build>`, such as `"14.368"`. */
  version: z.string().regex(/^\d+\.\d+$/, '<generation>.<build>'),
  generation: z.int().positive(),
  channel: CoreChannel,
});
export type CoreRelease = z.infer<typeof CoreRelease>;
