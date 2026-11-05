/**
 * Rechecks: packages' own manifests checked again now, as a client's "check live" asks, rather than at the worker's
 * next hourly check. One checked in the last few minutes is given as it was then, so that however many clients ask,
 * a package's manifest is fetched at most once in that time.
 */
import { RECHECK_MIN_SECONDS, packageKey } from '@mondarth/fvtt-package-catalogue-contract';

import { RETRY_AFTER_SECONDS } from './lookup.js';
import { checkOwnManifests } from './refresh.js';

import type { PackageRef, RecheckResponse } from '@mondarth/fvtt-package-catalogue-contract';
import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { CatalogueStore, PackageDetails } from './store/types.js';

/** What a recheck works with. */
export interface RecheckOptions {
  readonly http: HttpClient;
  /** The time now. */
  readonly now: Date;
}

/** What a package's own manifest gave, as the contract gives it. */
const ownOf = (about: PackageDetails | undefined) => ({
  version: about?.ownVersion ?? null,
  readAt: about?.ownReadAt?.toISOString() ?? null,
  checkedAt: about?.ownCheckedAt?.toISOString() ?? null,
});

/**
 * Checks the own manifests of the packages asked for that the catalogue holds, and can be had, now, unless checked in
 * the last {@link RECHECK_MIN_SECONDS}; keeps what each check found, as the worker's checks do, and queues those that
 * give a version not held, as asked for.
 *
 * @param store - The catalogue
 * @param refs - The packages
 * @param options - The client to fetch with, and the time now
 * @returns Each package held, once, with what its own manifest gives, and those queued
 */
export async function recheck(
  store: CatalogueStore,
  refs: readonly PackageRef[],
  { http, now }: RecheckOptions,
): Promise<RecheckResponse> {
  const asked = [...new Map(refs.map(ref => [packageKey(ref), ref])).values()];
  const [before, held] = await Promise.all([store.detailsOf(asked), store.releasesOfEach(asked)]);
  // Those held, and available, each with its releases.
  const candidates = asked.flatMap(ref => {
    const found = held.get(packageKey(ref));
    return found?.unavailable === null ? [{ ref, releases: found.releases }] : [];
  });
  const available = candidates.map(({ ref }) => ref);
  const since = now.getTime() - RECHECK_MIN_SECONDS * 1000;
  const due = candidates.filter(({ ref }) => {
    const checkedAt = before.get(packageKey(ref))?.ownCheckedAt;
    return checkedAt == null || checkedAt.getTime() <= since;
  });

  const checks = await checkOwnManifests(http, due);
  await store.saveOwnChecks(checks, now);
  const changed = checks.filter(check => check.changed).map(check => check.ref);
  if (changed.length > 0) await store.requestCrawl(changed.map(ref => ({ package: ref, reason: 'request' })));

  const after = due.length > 0 ? await store.detailsOf(available) : before;
  const queued = new Set(changed.map(packageKey));
  return {
    packages: available.map(ref => ({
      package: ref,
      own: ownOf(after.get(packageKey(ref))),
      changed: queued.has(packageKey(ref)),
    })),
    pending: changed.map(ref => ({ package: ref, retryAfter: RETRY_AFTER_SECONDS })),
  };
}
