import { describe, expect, it } from 'vitest';

import { cacheHeaders, cachedJson, notModified } from '../../../../src/lib/server/http/cache.js';

const asking = (ifNoneMatch?: string) =>
  new Request('http://catalogue.test/', { headers: ifNoneMatch === undefined ? {} : { 'If-None-Match': ifNoneMatch } });

describe('notModified', () => {
  it('is when the client names the ETag, weak or not, among others, or asks for any', () => {
    expect(notModified(asking('"a"'), '"a"')).toBe(true);
    expect(notModified(asking('W/"a"'), '"a"')).toBe(true);
    expect(notModified(asking('"b", "a"'), '"a"')).toBe(true);
    expect(notModified(asking('*'), '"a"')).toBe(true);
  });

  it('is not when the client names another, or none', () => {
    expect(notModified(asking('"b"'), '"a"')).toBe(false);
    expect(notModified(asking(), '"a"')).toBe(false);
  });
});

describe('cachedJson', () => {
  it('gives the body with its ETag and how long to keep it', async () => {
    const response = await cachedJson('"a"', asking(), () => Promise.resolve('{"ok":true}'), 300);
    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBe('"a"');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=86400');
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('answers 304, without making the body, to a client that has it', async () => {
    let made = false;
    const response = await cachedJson(
      '"a"',
      asking('"a"'),
      () => {
        made = true;
        return Promise.resolve('{}');
      },
      300,
    );
    expect(response.status).toBe(304);
    expect(response.headers.get('ETag')).toBe('"a"');
    expect(made).toBe(false);
  });

  it('keeps the headers apart from the body', () => {
    expect(cacheHeaders('"a"', 60)).toEqual({
      ETag: '"a"',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
    });
  });
});
