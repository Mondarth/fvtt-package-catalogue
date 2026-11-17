import { describe, expect, it } from 'vitest';

import { describeAgent } from '../../src/lib/user-agent.js';

describe('describeAgent', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 OPR/120.0',
      'Opera on ChromeOS',
    ],
  ])('says %s is %s', (agent, said) => {
    expect(describeAgent(agent)).toBe(said);
  });

  it('says what it can of the rest', () => {
    expect(describeAgent('Firefox/140.0')).toBe('Firefox');
    expect(describeAgent('Something (Linux)')).toBe('Linux');
    expect(describeAgent('curl/8.0')).toBeNull();
    expect(describeAgent(null)).toBeNull();
    expect(describeAgent(undefined)).toBeNull();
  });
});
