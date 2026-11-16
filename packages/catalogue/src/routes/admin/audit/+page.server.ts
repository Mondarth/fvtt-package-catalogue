import type { PageServerLoad } from './$types';

/** How many entries a page of the audit log shows. */
const ENTRIES_PER_PAGE = 100;

/** The audit log, the newest first, a page at a time: `?before=<id>` for the next. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const before = Number.parseInt(url.searchParams.get('before') ?? '', 10);
  const entries = await locals.audit.recent({
    limit: ENTRIES_PER_PAGE,
    ...(Number.isInteger(before) && before > 0 && { beforeId: before }),
  });
  // A full page has a last entry.
  /* v8 ignore next */
  const last = entries.at(-1)?.id ?? null;
  return { entries, next: entries.length === ENTRIES_PER_PAGE ? last : null };
};
