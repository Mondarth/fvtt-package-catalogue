import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import {
  cachedEntitlements,
  ENTITLEMENT_CACHE_MS,
  entitlementOf,
  requireEntitled,
} from '../../../../src/lib/server/subscriptions/entitlement.js';

import type { SubscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';

const until = new Date('2027-01-01T00:00:00Z');
const storeWith = (active: boolean) => {
  const status = vi.fn(() => Promise.resolve({ paidUntil: active ? until : null, active }));
  return { status, store: { status } as unknown as SubscriptionStore };
};

describe('entitlementOf', () => {
  it('is a subscriber’s, and read once however often it is asked for', async () => {
    const { status, store } = storeWith(true);
    const entitlement = entitlementOf(store, 'u1', false);
    expect(await entitlement()).toEqual({ paidUntil: until, active: true, entitled: true });
    await entitlement();
    expect(status).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('u1');
  });

  it('is an admin’s, subscribed or not', async () => {
    expect(await entitlementOf(storeWith(false).store, 'u1', true)()).toMatchObject({ active: false, entitled: true });
  });

  it('is none without a subscription, or without anyone signed in', async () => {
    expect(await entitlementOf(storeWith(false).store, 'u1', false)()).toMatchObject({ entitled: false });
    const { status, store } = storeWith(true);
    expect(await entitlementOf(store, undefined, false)()).toEqual({ paidUntil: null, active: false, entitled: false });
    expect(status).not.toHaveBeenCalled();
  });

  it('is not read unless asked for', () => {
    const { status, store } = storeWith(true);
    entitlementOf(store, 'u1', false);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('requireEntitled', () => {
  it('lets a change through for someone entitled, and refuses it for anyone else', async () => {
    await expect(requireEntitled(entitlementOf(storeWith(true).store, 'u1', false))).resolves.toBeUndefined();
    const refused = await requireEntitled(entitlementOf(storeWith(false).store, 'u1', false)).catch(
      (error: unknown) => error,
    );
    expect(isHttpError(refused, 403)).toBe(true);
  });
});

describe('cachedEntitlements', () => {
  it('keeps each user’s for a minute, then reads it again', async () => {
    const { status, store } = storeWith(true);
    let time = 1_000;
    const entitlement = cachedEntitlements(
      store,
      () => false,
      () => time,
    );
    expect(await entitlement({ id: 'u1' })).toEqual({ paidUntil: until, active: true, entitled: true });
    await entitlement({ id: 'u1' });
    expect(status).toHaveBeenCalledOnce();
    time += ENTITLEMENT_CACHE_MS;
    await entitlement({ id: 'u1' });
    expect(status).toHaveBeenCalledTimes(2);
    await entitlement({ id: 'u2' });
    expect(status).toHaveBeenCalledTimes(3);
  });

  it('entitles an admin, subscribed or not, and reads the time now by default', async () => {
    const entitlement = cachedEntitlements(storeWith(false).store, user => user.role === 'admin');
    expect(await entitlement({ id: 'u1', role: 'admin' })).toMatchObject({ active: false, entitled: true });
    expect(await entitlement({ id: 'u2', role: 'user' })).toMatchObject({ entitled: false });
  });

  it('keeps at most ten thousand users, forgetting the oldest first', async () => {
    const { status, store } = storeWith(true);
    const entitlement = cachedEntitlements(
      store,
      () => false,
      () => 0,
    );
    for (let user = 0; user <= 10_000; user++) await entitlement({ id: `u${String(user)}` });
    status.mockClear();
    await entitlement({ id: 'u10000' });
    expect(status).not.toHaveBeenCalled();
    await entitlement({ id: 'u0' });
    expect(status).toHaveBeenCalledOnce();
  });
});
