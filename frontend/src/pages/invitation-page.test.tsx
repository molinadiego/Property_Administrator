import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { ME_ONE_SPACE, ME_TWO_SPACES } from '@/test/fixtures';
import { currentPath, renderApp } from '@/test/render-app';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isPreview = (call: { url: string; method: string }) =>
  call.url.endsWith('/invitations/tok-1') && call.method === 'GET';
const isAccept = (call: { url: string; method: string }) =>
  call.url.endsWith('/invitations/tok-1/accept') && call.method === 'POST';

const PREVIEW = {
  companyName: 'Gestión Demo',
  emailMasked: 'i****o@demo.test',
  role: 'member',
  expiresAt: '2026-11-01T00:00:00.000Z',
};

describe('invitation screen (spec F1 §2, AC-F1.4/AC-F1.5)', () => {
  it('shows the preview and joins with the current session ({}) on accept', async () => {
    const user = userEvent.setup();
    let meCalls = 0;
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, meCalls++ === 0 ? ME_ONE_SPACE : ME_TWO_SPACES);
      if (isPreview(call)) return jsonResponse(200, PREVIEW);
      if (isAccept(call)) return jsonResponse(204);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/invitations/tok-1']);

    expect(await screen.findByRole('heading', { name: 'Te invitaron a unirte a Gestión Demo' })).toBeVisible();
    expect(screen.getByText('i****o@demo.test')).toBeVisible();
    expect(screen.getByText('Miembro')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Unirme a Gestión Demo' }));

    // New membership lands in `me` → back at the root the picker takes over.
    await waitFor(() => expect(currentPath(router)).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Elige un espacio' })).toBeVisible();
    expect(apiCalls(isAccept)[0].body).toEqual({});
  });

  it('creates the account and joins in one step when there is no session (F1-D5)', async () => {
    const user = userEvent.setup();
    let meCalls = 0;
    setFetchHandler((call) => {
      if (isMe(call)) {
        return meCalls++ === 0 ? problemJson(401, 'Unauthorized') : jsonResponse(200, ME_ONE_SPACE);
      }
      if (isPreview(call)) return jsonResponse(200, PREVIEW);
      if (isAccept(call)) return jsonResponse(204);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/invitations/tok-1']);

    expect(await screen.findByText('Crea tu cuenta y únete')).toBeVisible();
    await user.type(screen.getByLabelText('Nombre'), 'Invitada Nueva');
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta y unirme' }));

    // The session cookie arrives with the 204, so the single membership
    // auto-selects the space (F0-D1) straight into the shell.
    await waitFor(() => expect(currentPath(router)).toBe('/app'));
    expect(apiCalls(isAccept)[0].body).toEqual({
      name: 'Invitada Nueva',
      password: 'Secreta123!',
    });
  });

  it('offers the login route that returns to the invitation (?next, F1-D6)', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isPreview(call)) return jsonResponse(200, PREVIEW);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/invitations/tok-1']);

    const loginLink = await screen.findByRole('link', { name: 'Inicia sesión y únete' });
    expect(loginLink).toHaveAttribute('href', '/login?next=%2Finvitations%2Ftok-1');
  });

  it('renders the expired state on a 410 preview (AC-F1.5)', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isPreview(call)) return problemJson(410, 'La invitación expiró.');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/invitations/tok-1']);

    expect(await screen.findByRole('heading', { name: 'Invitación expirada' })).toBeVisible();
    expect(
      screen.getByText('Esta invitación expiró. Pide que te envíen una nueva.'),
    ).toBeVisible();
  });

  it('renders the invalid state on a 404 preview', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isPreview(call)) return problemJson(404, 'Invitación inválida.');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/invitations/tok-1']);

    expect(await screen.findByRole('heading', { name: 'Invitación no válida' })).toBeVisible();
  });
});
