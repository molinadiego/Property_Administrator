import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { storageKeys } from '@/lib/storage';
import {
  ME_MEMBER_ONE_SPACE,
  ME_TWO_SPACES,
  MEMBERS_GESTION,
  PENDING_INVITATION,
} from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isMembers = (call: { url: string; method: string }) =>
  call.url.includes('/companies/c-1/members') && call.method === 'GET';
const isInvitations = (call: { url: string; method: string }) =>
  call.url.includes('/companies/c-1/invitations') && call.method === 'GET';

/** With 2 memberships the active space must be pre-selected (F0-D1). */
function renderMembers() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/settings/members']);
}

/** Active space `c-1`; member/invitation endpoints answer per test. */
function serveOwnerPanel(options?: { patch?: Response }) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
    if (isInvitations(call)) return jsonResponse(200, { data: [PENDING_INVITATION], nextCursor: null });
    if (options?.patch && call.url.includes('/companies/c-1/members/') && call.method === 'PATCH') {
      return options.patch;
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

describe('members screen (spec F1 §3, AC-F1.6/AC-F1.9)', () => {
  it('lists members and pending invitations; the only owner cannot demote or revoke themselves', async () => {
    serveOwnerPanel();
    renderMembers();

    expect(await screen.findByText('Bob Contratista')).toBeVisible();
    expect(screen.getByText('Ana Demo')).toBeVisible();
    expect((await screen.findAllByText('ana@demo.test')).length).toBeGreaterThan(0);
    expect(screen.getByText('Invitaciones pendientes')).toBeVisible();
    expect(screen.getByText('invitado@demo.test')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();

    // Last owner: Ana's role and access are blocked (§4.2, AC-F1.9).
    expect(screen.getByRole('combobox', { name: 'Rol de Ana Demo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retirar el acceso de Ana Demo' })).toBeDisabled();
    // Bob stays manageable.
    expect(screen.getByRole('combobox', { name: 'Rol de Bob Contratista' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retirar el acceso de Bob Contratista' })).toBeEnabled();
  });

  it('shows read-only rows to plain members (UI never replaces the server check, §3.4)', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_MEMBER_ONE_SPACE);
      if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderMembers();

    expect(await screen.findByText('Bob Contratista')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Invitar miembro' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar acceso' })).toBeNull();
    expect(screen.getByText('Miembro')).toBeVisible();
  });

  it('changes a role through the select and refetches the list (AC-F1.9)', async () => {
    serveOwnerPanel({ patch: jsonResponse(200, { membershipId: 'm-bob', role: 'owner' }) });
    const user = userEvent.setup();
    renderMembers();

    await screen.findByText('Bob Contratista');
    await user.click(screen.getByRole('combobox', { name: 'Rol de Bob Contratista' }));
    await user.click(await screen.findByRole('option', { name: 'Propietario' }));

    const patch = apiCalls(
      (call) => call.method === 'PATCH' && call.url.includes('/members/m-bob'),
    )[0];
    expect(patch.body).toEqual({ role: 'owner' });
    await waitFor(() => expect(apiCalls(isMembers).length).toBeGreaterThanOrEqual(2));
  });

  it('surfaces the RFC 7807 detail when the server rejects a role change (409)', async () => {
    serveOwnerPanel({
      patch: problemJson(409, 'La última persona con rol Propietario no puede degradarse.'),
    });
    const user = userEvent.setup();
    renderMembers();

    await screen.findByText('Bob Contratista');
    await user.click(screen.getByRole('combobox', { name: 'Rol de Bob Contratista' }));
    await user.click(await screen.findByRole('option', { name: 'Propietario' }));

    expect(
      await screen.findByText('La última persona con rol Propietario no puede degradarse.'),
    ).toBeVisible();
  });

  it('invites a member by email with the selected role (F1-D1)', async () => {
    serveOwnerPanel();
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
      if (isInvitations(call)) return jsonResponse(200, { data: [PENDING_INVITATION], nextCursor: null });
      if (call.url.endsWith('/companies/c-1/invitations') && call.method === 'POST') {
        return jsonResponse(201, {
          id: 'inv-2',
          email: 'nuevo@demo.test',
          role: 'owner',
          status: 'pending',
          expiresAt: '2026-11-01T00:00:00.000Z',
          createdAt: '2026-10-15T10:30:00.000Z',
        });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderMembers();

    await user.click(await screen.findByRole('button', { name: 'Invitar miembro' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Correo electrónico'), 'nuevo@demo.test');
    await user.click(within(dialog).getByLabelText('Rol a otorgar'));
    await user.click(await screen.findByRole('option', { name: 'Propietario' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));

    const post = apiCalls(
      (call) => call.method === 'POST' && call.url.endsWith('/companies/c-1/invitations'),
    )[0];
    expect(post.body).toEqual({ email: 'nuevo@demo.test', role: 'owner' });
    expect(
      await screen.findByText(
        'Invitación enviada a nuevo@demo.test. Aparecerá aquí cuando sea pendiente.',
      ),
    ).toBeVisible();
  });

  it('revokes a member behind a confirmation dialog (AC-F1.10)', async () => {
    serveOwnerPanel();
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
      if (isInvitations(call)) return jsonResponse(200, { data: [], nextCursor: null });
      if (call.url.includes('/companies/c-1/members/m-bob') && call.method === 'DELETE') {
        return jsonResponse(204);
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderMembers();

    await user.click(
      await screen.findByRole('button', { name: 'Retirar el acceso de Bob Contratista' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Dejará de tener acceso a este espacio de inmediato. Su cuenta personal y su historial se conservan.',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Retirar acceso' }));

    expect(
      apiCalls((call) => call.method === 'DELETE' && call.url.includes('/members/m-bob')),
    ).toHaveLength(1);
    await waitFor(() => expect(apiCalls(isMembers).length).toBeGreaterThanOrEqual(2));
  });

  it('revokes a pending invitation (F1-D1)', async () => {
    serveOwnerPanel();
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
      if (isInvitations(call)) return jsonResponse(200, { data: [PENDING_INVITATION], nextCursor: null });
      if (call.url.includes('/companies/c-1/invitations/inv-1') && call.method === 'DELETE') {
        return jsonResponse(204);
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderMembers();

    await user.click(
      await screen.findByRole('button', { name: 'Revocar la invitación de invitado@demo.test' }),
    );

    expect(
      apiCalls((call) => call.method === 'DELETE' && call.url.includes('/invitations/inv-1')),
    ).toHaveLength(1);
    await waitFor(() => expect(apiCalls(isInvitations).length).toBeGreaterThanOrEqual(2));
  });
});
