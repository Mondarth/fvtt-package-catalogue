import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isPublicAddress, safeFetch } from '../../../src/lib/server/safe-fetch.js';

import type { AddressInfo } from 'node:net';
import type { Server, ServerResponse } from 'node:http';

describe('isPublicAddress', () => {
  it.each(['93.184.215.14', '140.82.121.3', '2606:4700::6810:84e5', '::ffff:93.184.215.14'])(
    '%s is public',
    address => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.51.100.7',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '64:ff9b::a00:1',
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    'not an address',
  ])('%s is not', address => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('safeFetch', () => {
  let server: Server;
  let base = '';
  const loopback = { allow: (address: string) => address === '127.0.0.1' || address === '::1' };
  // A Map, not an object: a path such as /constructor names no route.
  const routes = new Map<string, (response: ServerResponse) => void>(
    Object.entries({
      '/module.json': response => response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"a"}'),
      '/moved': response => response.writeHead(302, { Location: '/module.json' }).end(),
      '/loop': response => response.writeHead(301, { Location: '/loop' }).end(),
      '/away': response => response.writeHead(307, { Location: 'http://10.0.0.1/module.json' }).end(),
      '/odd-redirect': response => response.writeHead(302, { Location: 'http://[::1' }).end(),
      '/gone': response => response.writeHead(404).end(),
      '/declared-large': response => response.writeHead(200, { 'Content-Length': '2048' }).end('x'.repeat(2048)),
      '/large': response => {
        response.writeHead(200);
        response.write('x'.repeat(600));
        response.end('x'.repeat(600));
      },
      '/cut': response => {
        response.writeHead(200);
        response.write('{"id":');
        setTimeout(() => response.socket?.destroy(), 20);
      },
      '/slow': response => {
        response.writeHead(200);
        response.write('{');
        // Never ends.
      },
    }),
  );

  beforeAll(async () => {
    server = createServer((request, response) => {
      const route = routes.get(request.url ?? '');
      // Checked to be one of the routes' handlers before it is called, as a path names it.
      if (typeof route === 'function') route(response);
      else response.writeHead(500).end();
    });
    // On both stacks: the system's resolver may give localhost as ::1 first.
    await new Promise<void>(resolve => server.listen(0, '::', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve =>
      server.close(() => {
        resolve();
      }),
    );
  });

  /** The test server, by a name that resolves to it, on its port, which only a test may be allowed. */
  const named = (path: string) => `http://catalogue-test.example:${new URL(base).port}${path}`;
  const toServer = () => ({
    ...loopback,
    ports: [new URL(base).port],
    resolve: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
  });

  it('fetches a public URL, by name or by address, giving the body and where it came from', async () => {
    expect(await safeFetch(named('/module.json'), toServer())).toEqual({
      ok: true,
      url: named('/module.json'),
      body: '{"id":"a"}',
    });
    expect(await safeFetch(`${base}/module.json`, { ...loopback, ports: [new URL(base).port] })).toMatchObject({
      ok: true,
    });
  });

  it('follows a redirect, checking where it goes, and refuses one too many', async () => {
    expect(await safeFetch(named('/moved'), toServer())).toEqual({
      ok: true,
      url: named('/module.json'),
      body: '{"id":"a"}',
    });
    expect(await safeFetch(named('/away'), toServer())).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch(named('/loop'), toServer())).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch(named('/odd-redirect'), toServer())).toEqual({ ok: false, reason: 'refused' });
  });

  it('gives the status of an answer that is not a success', async () => {
    expect(await safeFetch(named('/gone'), toServer())).toEqual({ ok: false, reason: 'http', status: 404 });
  });

  it('cuts off an answer larger than it reads, as declared or as it comes', async () => {
    expect(await safeFetch(named('/declared-large'), { ...toServer(), maxBytes: 1000 })).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(await safeFetch(named('/large'), { ...toServer(), maxBytes: 1000 })).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('gives up on an answer that takes too long, however it trickles', async () => {
    expect(await safeFetch(named('/slow'), { ...toServer(), timeoutMs: 200 })).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(await safeFetch(named('/module.json'), { ...toServer(), timeoutMs: 0 })).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('gives an answer cut off partway as the network failing', async () => {
    expect(await safeFetch(named('/cut'), toServer())).toEqual({ ok: false, reason: 'network' });
  });

  it("looks a name up with the system's resolver by default", async () => {
    const port = new URL(base).port;
    expect(await safeFetch(`http://localhost:${port}/module.json`, { ...loopback, ports: [port] })).toMatchObject({
      ok: true,
      body: '{"id":"a"}',
    });
    // Refused by default: localhost is the loopback.
    expect(await safeFetch(`http://localhost:${port}/module.json`, { ports: [port] })).toEqual({
      ok: false,
      reason: 'refused',
    });
    expect(await safeFetch('http://no-such-host.invalid/module.json')).toEqual({ ok: false, reason: 'network' });
  });

  it('gives a connection refused as the network failing', async () => {
    const closed = createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const port = String((closed.address() as AddressInfo).port);
    await new Promise<void>(resolve =>
      closed.close(() => {
        resolve();
      }),
    );
    expect(await safeFetch(`http://127.0.0.1:${port}/`, { ...loopback, ports: [port] })).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('fetches over https, refusing what it would of http', async () => {
    expect(await safeFetch('https://10.0.0.1/module.json')).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch('https://example.com:8443/module.json')).toEqual({ ok: false, reason: 'refused' });
    const resolve = () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
    // Nothing answers https on the test server's address and port: the connection is made, through the lookup, and fails.
    expect(
      await safeFetch(`https://catalogue-test.example:${new URL(base).port}/`, { ...toServer(), resolve }),
    ).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('refuses a port other than the standard ones, and protocols other than the web', async () => {
    expect(await safeFetch(`${base}/module.json`, loopback)).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch('ftp://example.com/module.json', loopback)).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch('not a url', loopback)).toEqual({ ok: false, reason: 'refused' });
  });

  it('refuses a host given as a private address, without connecting', async () => {
    expect(await safeFetch('http://127.0.0.1/module.json')).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch('http://[::1]/module.json')).toEqual({ ok: false, reason: 'refused' });
    expect(await safeFetch('http://169.254.169.254/latest/meta-data/')).toEqual({ ok: false, reason: 'refused' });
  });

  it('refuses a name that resolves to a private address, as the connection looks it up', async () => {
    const resolve = () => Promise.resolve([{ address: '10.0.0.5', family: 4 }]);
    expect(await safeFetch('http://internal.example/module.json', { resolve })).toEqual({
      ok: false,
      reason: 'refused',
    });
    const mixed = () =>
      Promise.resolve([
        { address: '93.184.215.14', family: 4 },
        { address: '192.168.0.1', family: 4 },
      ]);
    expect(await safeFetch('https://mixed.example/module.json', { resolve: mixed })).toEqual({
      ok: false,
      reason: 'refused',
    });
    expect(await safeFetch('http://none.example/', { resolve: () => Promise.resolve([]) })).toEqual({
      ok: false,
      reason: 'refused',
    });
  });

  it('gives a name that cannot be resolved as the network failing', async () => {
    const resolve = () => Promise.reject(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    expect(await safeFetch('http://nowhere.example/', { resolve })).toEqual({ ok: false, reason: 'network' });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- what is being tested
    expect(await safeFetch('http://nowhere.example/', { resolve: () => Promise.reject('lost') })).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
