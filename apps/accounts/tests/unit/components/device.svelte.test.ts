import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Device from '../../../src/routes/device/+page.svelte';
import Profile from '../../../src/routes/profile/+page.svelte';
import { messagesOf } from '../support/messages.js';

const en = messagesOf('en');

describe('the /device page', () => {
  const show = (data: Record<string, unknown>, form: unknown = null) =>
    render(Device, { data, form, params: {} } as never);

  it('asks to sign in first, each provider coming back to the code', () => {
    show({ state: 'sign-in', providers: ['github'], next: '/device?user_code=X' });
    expect(screen.getByText(en.device_sign_in_first)).toBeInTheDocument();
    const form = screen.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'GitHub') }).closest('form');
    expect(form?.querySelector('input[name="next"]')).toHaveValue('/device?user_code=X');
  });

  it('shows which client asks, and the code to check, with Approve and Deny', () => {
    show({ state: 'confirm', code: 'WDJBMJHT', client: 'emma-extension' });
    expect(
      screen.getByText(en.device_confirm.replace('{client}', en.device_client_emma_extension)),
    ).toBeInTheDocument();
    expect(screen.getByText('WDJBMJHT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.device_approve }).closest('form')).toHaveAttribute(
      'action',
      '?/approve',
    );
    expect(screen.getByRole('button', { name: en.device_deny }).closest('form')).toHaveAttribute('action', '?/deny');
  });

  it('names a client it does not know by its id', () => {
    show({ state: 'confirm', code: 'X', client: 'other-client' });
    expect(screen.getByText(en.device_confirm.replace('{client}', 'other-client'))).toBeInTheDocument();
  });

  it('asks for the code', () => {
    show({ state: 'enter' });
    expect(screen.getByRole('textbox', { name: en.device_enter_label })).toBeRequired();
  });

  it.each([
    ['approved', en.device_approved],
    ['denied', en.device_denied],
  ])('says it was %s', (state, said) => {
    show({ state });
    expect(screen.getByRole('status')).toHaveTextContent(said);
  });

  it.each([
    ['expired', en.device_expired],
    ['unknown', en.device_unknown],
    ['already', en.device_already],
    ['impersonating', en.device_impersonating],
  ])('says what is wrong: %s', (state, said) => {
    show({ state });
    expect(screen.getByRole('alert')).toHaveTextContent(said);
  });

  it('says what a refused decision came to, in place of the code', () => {
    show({ state: 'confirm', code: 'X', client: 'emma-extension' }, { state: 'expired' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.device_expired);
    expect(screen.queryByRole('button', { name: en.device_approve })).not.toBeInTheDocument();
  });
});

describe("the profile's signed-in devices", () => {
  const PROFILE = { handle: 'h', nickname: null, name: 'Ada', email: 'a@example.test', image: null, providers: [] };
  const device = (id: string, kind: string, current = false, agent: string | null = null) => ({
    id,
    kind,
    current,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    agent,
  });
  const show = (more: Record<string, unknown> = {}, form: unknown = null) =>
    render(Profile, {
      data: {
        profile: PROFILE,
        problem: null,
        saved: false,
        signedOut: null,
        impersonated: false,
        deletionBlock: null,
        devices: [
          device('here', 'website', true, 'Firefox on Linux'),
          device('ext', 'emma-extension'),
          device('view', 'impersonation'),
        ],
        ...more,
      },
      form,
      params: {},
    } as never);

  it('lists each, saying what signed in, which is this browser, and offers to sign the others out', () => {
    show();
    const devices = screen.getByRole('region', { name: en.devices_heading });
    const items = within(devices).getAllByRole('listitem');
    const [here] = items;
    if (here === undefined) throw new Error('No devices listed');
    expect(items[0]).toHaveTextContent(en.devices_website);
    expect(items[0]).toHaveTextContent(en.devices_this);
    expect(items[0]).toHaveTextContent('Firefox on Linux');
    expect(within(here).queryByRole('button')).not.toBeInTheDocument();
    expect(items[1]).toHaveTextContent(en.device_client_emma_extension);
    expect(items[2]).toHaveTextContent(en.devices_impersonation);
    const signOuts = within(devices).getAllByRole('button', { name: /^Sign out: / });
    expect(signOuts).toHaveLength(2);
    expect(signOuts[0]).toHaveAccessibleName(
      `Sign out: ${en.device_client_emma_extension}, ${en.devices_created.replace('{date}', new Date('2026-11-01T00:00:00Z').toLocaleString('en'))}`,
    );
    expect(signOuts[0]).toHaveTextContent(en.devices_sign_out);
    expect(within(devices).getByRole('button', { name: en.devices_sign_out_others })).toBeInTheDocument();
  });

  it('offers nothing to sign out while an admin views the site as the user', () => {
    show({ impersonated: true });
    const devices = screen.getByRole('region', { name: en.devices_heading });
    expect(within(devices).queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no one else to sign out when there is no one else', () => {
    show({ devices: [device('here', 'website', true)] });
    expect(screen.queryByRole('button', { name: en.devices_sign_out_others })).not.toBeInTheDocument();
  });

  it.each([
    ['one', en.devices_signed_out],
    ['others', en.devices_signed_out_others],
  ])('says it signed out %s', (signedOut, said) => {
    show({ signedOut });
    expect(screen.getByText(said)).toBeInTheDocument();
  });

  it('says when signing out was refused', () => {
    show({}, { devices: 'refused' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.devices_refused);
  });
});
