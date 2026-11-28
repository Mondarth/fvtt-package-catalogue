import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/admin/services/+page.server.js';
import { fakeEvent } from '../support/event.js';

import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { Service } from '../../../src/lib/server/subscriptions/services.js';
import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

const ADMIN = { id: 'u-admin', role: 'admin' };
const CATALOGUE: Service = {
  id: 'catalogue',
  name: 'Catalogue',
  description: null,
  parentId: 'apps',
  createdBy: 'migration',
  createdAt: new Date('2026-11-27T00:00:00Z'),
  retiredAt: null,
  offers: 2,
};

type LoadEvent = Parameters<typeof load>[0];
type AddEvent = Parameters<NonNullable<(typeof actions)['add']>>[0];

describe('the services page', () => {
  it('gives every service, and the one just added', async () => {
    const result = await load(
      fakeEvent<LoadEvent>({
        url: 'http://accounts.test/admin/services?added=catalogue',
        locals: {
          subscriptions: { services: () => Promise.resolve([CATALOGUE]) } as unknown as SubscriptionStore,
        },
      }),
    );
    expect(result).toEqual({ services: [CATALOGUE], added: 'catalogue' });
  });

  /**
   * Adds a service, as the form does.
   * @param form - What the form sends
   * @param added - What the store answers
   * @returns What the action did, its store and its audit log
   */
  async function add(form: Record<string, string>, added: Awaited<ReturnType<SubscriptionStore['addService']>>) {
    const addService = vi.fn(() => Promise.resolve(added));
    const record = vi.fn(() => Promise.resolve());
    const run = actions.add;
    if (run === undefined) throw new Error('No add action');
    const event = fakeEvent<AddEvent>({
      url: 'http://accounts.test/admin/services?/add',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      locals: {
        user: ADMIN as never,
        subscriptions: { addService } as unknown as SubscriptionStore,
        audit: { record } as unknown as AuditStore,
      },
    });
    // A failure is returned; a redirect, thrown: either is what the action came to.
    let result: unknown;
    try {
      result = await run(event);
    } catch (error) {
      result = error;
    }
    return { result, addService, record };
  }

  it('adds one under another, recording it, and shows it', async () => {
    const { result, addService, record } = await add(
      { parent: 'aide', name: ' AIDE beta ', id: 'aide-beta', description: 'The beta.' },
      { ...CATALOGUE, id: 'aide-beta', name: 'AIDE beta', parentId: 'aide' },
    );
    expect(addService).toHaveBeenCalledWith({
      id: 'aide-beta',
      name: 'AIDE beta',
      description: 'The beta.',
      parentId: 'aide',
      createdBy: 'u-admin',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-admin',
        action: 'service.add',
        after: { service: 'aide-beta', name: 'AIDE beta', parent: 'aide' },
      }),
    );
    expect(isRedirect(result) && result.location).toBe('/admin/services?added=aide-beta');
  });

  it('adds one at the top', async () => {
    const { addService } = await add({ parent: '', name: 'Games', id: 'games', description: 'Games.' }, CATALOGUE);
    expect(addService).toHaveBeenCalledWith(expect.objectContaining({ id: 'games', parentId: null }));
  });

  it.each([
    ['no name', { name: '' }, 'name'],
    ['a name too long', { name: 'x'.repeat(81) }, 'name'],
    ['no id', { id: '' }, 'id'],
    ['an id that is not one', { id: 'Not One' }, 'id'],
    ['an id too long', { id: 'x'.repeat(41) }, 'id'],
    ['no description', { description: '' }, 'description'],
    ['a description too long', { description: 'x'.repeat(501) }, 'description'],
  ])('refuses %s, saying which field, and adds nothing', async (_, given, problem) => {
    const { result, addService } = await add(
      { parent: 'apps', name: 'Fine', id: 'fine', description: 'Fine.', ...given },
      CATALOGUE,
    );
    expect(isActionFailure(result) && result.data).toMatchObject({ problem, parent: 'apps' });
    expect(addService).not.toHaveBeenCalled();
  });

  it.each(['taken', 'no-parent'] as const)('says the store refused it: %s', async refused => {
    const { result, record } = await add(
      { parent: 'apps', name: 'Catalogue', id: 'catalogue', description: 'The catalogue.' },
      refused,
    );
    expect(isActionFailure(result) && result.data).toMatchObject({ problem: refused, name: 'Catalogue' });
    expect(record).not.toHaveBeenCalled();
  });
});
