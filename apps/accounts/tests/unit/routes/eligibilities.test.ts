import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/admin/eligibilities/+page.server.js';
import { fakeEvent } from '../support/event.js';

import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { Eligibility } from '../../../src/lib/server/subscriptions/eligibilities.js';
import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

const ADMIN = { id: 'u-admin', role: 'admin' };
const CATALOGUE: Eligibility = {
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

describe('the eligibilities page', () => {
  it('gives every eligibility, and the one just added', async () => {
    const result = await load(
      fakeEvent<LoadEvent>({
        url: 'http://accounts.test/admin/eligibilities?added=catalogue',
        locals: {
          subscriptions: { eligibilities: () => Promise.resolve([CATALOGUE]) } as unknown as SubscriptionStore,
        },
      }),
    );
    expect(result).toEqual({ eligibilities: [CATALOGUE], added: 'catalogue' });
  });

  /**
   * Adds an eligibility, as the form does.
   * @param form - What the form sends
   * @param added - What the store answers
   * @returns What the action did, its store and its audit log
   */
  async function add(form: Record<string, string>, added: Awaited<ReturnType<SubscriptionStore['addEligibility']>>) {
    const addEligibility = vi.fn(() => Promise.resolve(added));
    const record = vi.fn(() => Promise.resolve());
    const run = actions.add;
    if (run === undefined) throw new Error('No add action');
    const event = fakeEvent<AddEvent>({
      url: 'http://accounts.test/admin/eligibilities?/add',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      locals: {
        user: ADMIN as never,
        subscriptions: { addEligibility } as unknown as SubscriptionStore,
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
    return { result, addEligibility, record };
  }

  it('adds one under another, its id made from its name, recording it, and shows it', async () => {
    const { result, addEligibility, record } = await add(
      { parent: 'aide', name: ' AIDE beta ', id: '', description: 'The beta.' },
      { ...CATALOGUE, id: 'aide-beta', name: 'AIDE beta', parentId: 'aide' },
    );
    expect(addEligibility).toHaveBeenCalledWith({
      id: 'aide-beta',
      name: 'AIDE beta',
      description: 'The beta.',
      parentId: 'aide',
      createdBy: 'u-admin',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-admin',
        action: 'eligibility.add',
        after: { eligibility: 'aide-beta', name: 'AIDE beta', parent: 'aide' },
      }),
    );
    expect(isRedirect(result) && result.location).toBe('/admin/eligibilities?added=aide-beta');
  });

  it('adds one at the top, with the id given and no description', async () => {
    const { addEligibility } = await add({ parent: '', name: 'Games', id: 'games', description: '' }, CATALOGUE);
    expect(addEligibility).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'games', parentId: null, description: null }),
    );
  });

  it.each([
    ['no name', { name: '' }, 'name'],
    ['a name too long', { name: 'x'.repeat(81) }, 'name'],
    ['an id that is not one', { name: 'Fine', id: 'Not One' }, 'id'],
    ['a name with nothing to make an id of', { name: '!!!' }, 'id'],
    ['an id too long', { name: 'Fine', id: 'x'.repeat(41) }, 'id'],
    ['a description too long', { name: 'Fine', description: 'x'.repeat(501) }, 'description'],
  ])('refuses %s, saying which field, and adds nothing', async (_, given, problem) => {
    const { result, addEligibility } = await add({ parent: 'apps', id: '', description: '', ...given }, CATALOGUE);
    expect(isActionFailure(result) && result.data).toMatchObject({ problem, parent: 'apps' });
    expect(addEligibility).not.toHaveBeenCalled();
  });

  it.each(['taken', 'no-parent'] as const)('says the store refused it: %s', async refused => {
    const { result, record } = await add({ parent: 'apps', name: 'Catalogue', id: '', description: '' }, refused);
    expect(isActionFailure(result) && result.data).toMatchObject({ problem: refused, name: 'Catalogue' });
    expect(record).not.toHaveBeenCalled();
  });
});
