import type { RequestHandler } from './$types';

/** The server is up. For the container's health check: it asks nothing of anything else. */
export const GET: RequestHandler = () => Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
