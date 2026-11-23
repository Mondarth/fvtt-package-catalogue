/**
 * Answers the same for every client, such as Foundry VTT's listing: given with an ETag, so that a client that has the
 * answer is told `304` and keeps it, and with how long it may keep it without asking.
 */

/** The headers of an answer that may be kept for `maxAge` seconds, and used for a day more while it is checked. */
export function cacheHeaders(etag: string, maxAge: number): Record<string, string> {
  return { ETag: etag, 'Cache-Control': `public, max-age=${String(maxAge)}, stale-while-revalidate=86400` };
}

/**
 * Whether the client has this answer already: its `If-None-Match` names the ETag, weak or not, or is `*`.
 *
 * @param request - The request
 * @param etag - The answer's ETag
 * @returns Whether it may be answered `304`
 */
export function notModified(request: Request, etag: string): boolean {
  const asked = request.headers.get('If-None-Match');
  if (asked === null) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  return asked.split(',').some(tag => tag.trim() === '*' || bare(tag) === bare(etag));
}

/**
 * An answer made once for each version of what it is made from: the ETag, or the body as JSON, while it is the same.
 *
 * @param etag - The ETag of the answer to give
 * @param request - The request, whose `If-None-Match` may name it
 * @param body - The body, as JSON, made only when the client does not have it
 * @param maxAge - How long it may be kept without asking, in seconds
 * @returns The response
 */
export async function cachedJson(
  etag: string,
  request: Request,
  body: () => Promise<string>,
  maxAge: number,
): Promise<Response> {
  const headers = cacheHeaders(etag, maxAge);
  if (notModified(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(await body(), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
