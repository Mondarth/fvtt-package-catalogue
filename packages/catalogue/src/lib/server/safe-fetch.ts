/**
 * Fetching a URL a client gave, from the server, without letting it reach what only the server can: the database, the
 * host, SWAG, or anything else on a private network. A client could otherwise ask the catalogue for
 * `http://db:5432/` or `http://169.254.169.254/` and be told what is there.
 *
 * Every address a host name resolves to is checked when the connection is made, by the lookup the connection uses, so
 * a name that resolves to a public address when checked and a private one when fetched (DNS rebinding) gains nothing.
 * A host given as an address is checked as it is. Only `http` and `https` on their own ports are fetched; redirects
 * are followed by hand, a few at most, each checked again; and the answer is cut off past a size and a time.
 */
import { lookup as dnsLookup } from 'node:dns';
import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

import type { LookupAddress, LookupOptions } from 'node:dns';
import type { IncomingMessage } from 'node:http';

/** Addresses no fetch a client asks for may reach: private, local, reserved, or for documentation. */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether an address is one a fetch a client asks for may reach: a public one. An IPv4 address mapped into IPv6
 * (`::ffff:10.0.0.1`) is judged as the IPv4 address it is.
 *
 * @param address - An IPv4 or IPv6 address
 * @returns Whether it is public
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !BLOCKED.check(address, 'ipv4');
  if (family !== 6) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped !== undefined) return !BLOCKED.check(mapped, 'ipv4');
  // Mapped addresses written in hex, ::ffff:a00:1, are refused rather than read.
  if (/^::ffff:/i.test(address)) return false;
  return !BLOCKED.check(address, 'ipv6');
}

/** Why a fetch gave no answer to read. */
export type SafeFetchFailure =
  | { readonly ok: false; readonly reason: 'refused' | 'network' | 'too-large' }
  | { readonly ok: false; readonly reason: 'http'; readonly status: number };

/** What a fetch gave. */
export type SafeFetched = { readonly ok: true; readonly url: string; readonly body: string } | SafeFetchFailure;

/** How a fetch is made. */
export interface SafeFetchOptions {
  /** The most bytes read of an answer; 1 MB by default. */
  readonly maxBytes?: number;
  /** How long the fetch may take, redirects and all, in milliseconds; ten seconds by default. */
  readonly timeoutMs?: number;
  /** The most redirects followed; three by default. */
  readonly maxRedirects?: number;
  readonly userAgent?: string;
  /** Which addresses may be reached; public ones by default. A test reaches its own server on the loopback. */
  readonly allow?: (address: string) => boolean;
  /** Resolves a host name to its addresses; the system's resolver by default. */
  readonly resolve?: (hostname: string) => Promise<LookupAddress[]>;
  /** Ports that may be fetched beside the protocol's own; none by default. A test reaches its own server on one. */
  readonly ports?: readonly string[];
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// One address a connection, the one the lookup checked, rather than several tried in turn: the lookup is asked for one.
const plainAgent = new HttpAgent({ autoSelectFamily: false });
const secureAgent = new HttpsAgent({ autoSelectFamily: false });

/** The system's resolver, every address of a name. */
const systemResolve = (hostname: string) =>
  new Promise<LookupAddress[]>((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

/** An error that says the fetch was refused, not that the network failed. */
class Refused extends Error {
  readonly code = 'EREFUSED_ADDRESS';
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Fetches a URL a client gave, as text, refusing what may not be reached.
 *
 * @param given - The URL
 * @param options - Its limits
 * @returns The answer's body and the URL it came from, after redirects, or why there is none
 */
export async function safeFetch(given: string, options: SafeFetchOptions = {}): Promise<SafeFetched> {
  const {
    maxBytes = 1024 * 1024,
    timeoutMs = 10_000,
    maxRedirects = 3,
    userAgent = 'fvtt-package-catalogue',
    allow = isPublicAddress,
    resolve = systemResolve,
    ports = [],
  } = options;
  const deadline = Date.now() + timeoutMs;

  // The lookup each connection makes: every address checked, so none is reached that was not. The connection asks for
  // one address, as it does not try several (see `autoSelectFamily` below).
  const lookup = (hostname: string, _options: LookupOptions, callback: LookupCallback): void => {
    resolve(hostname).then(
      addresses => {
        const [first] = addresses;
        if (first === undefined || !addresses.every(({ address }) => allow(address))) {
          callback(new Refused(`${hostname} is not public`), '');
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), '');
      },
    );
  };

  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return { ok: false, reason: 'refused' };
  }
  for (let redirects = 0; ; redirects++) {
    const hop = await fetchOnce(url, { lookup, allow, ports, maxBytes, deadline, userAgent });
    if (hop.kind === 'done') return hop.result;
    if (redirects >= maxRedirects) return { ok: false, reason: 'refused' };
    url = hop.to;
  }
}

type Hop = { readonly kind: 'done'; readonly result: SafeFetched } | { readonly kind: 'redirect'; readonly to: URL };

/** One request: its answer, or where it redirects. */
function fetchOnce(
  url: URL,
  {
    lookup,
    allow,
    ports,
    maxBytes,
    deadline,
    userAgent,
  }: {
    lookup: (hostname: string, options: LookupOptions, callback: LookupCallback) => void;
    allow: (address: string) => boolean;
    ports: readonly string[];
    maxBytes: number;
    deadline: number;
    userAgent: string;
  },
): Promise<Hop> {
  const done = (result: SafeFetched): Hop => ({ kind: 'done', result });
  const secure = url.protocol === 'https:';
  if (!secure && url.protocol !== 'http:') return Promise.resolve(done({ ok: false, reason: 'refused' }));
  if (url.port !== '' && url.port !== (secure ? '443' : '80') && !ports.includes(url.port)) {
    return Promise.resolve(done({ ok: false, reason: 'refused' }));
  }
  // A host given as an address is not looked up, so is checked here.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0 && !allow(host)) return Promise.resolve(done({ ok: false, reason: 'refused' }));
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve(done({ ok: false, reason: 'network' }));

  return new Promise<Hop>(settle => {
    let settled = false;
    // Of the whole request, not of idleness, so a server that answers a byte at a time is cut off.
    const timer = setTimeout(() => {
      request.destroy();
      finish(done({ ok: false, reason: 'network' }));
    }, remaining);
    const finish = (hop: Hop) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle(hop);
    };
    const request = (secure ? httpsRequest : httpRequest)(
      url,
      {
        lookup,
        agent: secure ? secureAgent : plainAgent,
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      },
      (response: IncomingMessage) => {
        /* v8 ignore next -- a client's answer always has its status; the type is of a server's request too */
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (REDIRECTS.has(status) && location !== undefined) {
          response.resume();
          let to: URL;
          try {
            to = new URL(location, url);
          } catch {
            finish(done({ ok: false, reason: 'refused' }));
            return;
          }
          finish({ kind: 'redirect', to });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          finish(done({ ok: false, reason: 'http', status }));
          return;
        }
        const declared = Number(response.headers['content-length'] ?? Number.NaN);
        if (declared > maxBytes) {
          response.destroy();
          finish(done({ ok: false, reason: 'too-large' }));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy();
            finish(done({ ok: false, reason: 'too-large' }));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          finish(done({ ok: true, url: url.href, body: Buffer.concat(chunks).toString('utf8') }));
        });
        response.on('error', () => {
          finish(done({ ok: false, reason: 'network' }));
        });
      },
    );
    request.on('error', (error: NodeJS.ErrnoException) => {
      finish(done({ ok: false, reason: error.code === 'EREFUSED_ADDRESS' ? 'refused' : 'network' }));
    });
    request.end();
  });
}
