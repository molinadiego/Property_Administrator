import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isForgot = (call: { url: string; method: string }) =>
  call.url.endsWith('/auth/password/forgot') && call.method === 'POST';
const isReset = (call: { url: string; method: string }) =>
  call.url.endsWith('/auth/password/reset') && call.method === 'POST';

describe('forgot password (spec F1 §2, AC-F1.2)', () => {
  it('always shows the same message: the backend never reveals the account (AC-1.7)', async () => {
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isForgot(call)) return jsonResponse(202);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/forgot-password']);

    await user.type(await screen.findByLabelText('Correo electrónico'), 'alguien@demo.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(
      await screen.findByText(
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar enlace' })).toBeNull();
  });
});

describe('password reset (spec F1 §2, AC-F1.3)', () => {
  it('renders the not-found page when the URL has no token', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/reset-password']);

    expect(await screen.findByText('Página no encontrada')).toBeVisible();
    expect(currentPath(router)).toBe('/reset-password');
  });

  it('lands on login with a notice on 204', async () => {
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isReset(call)) return jsonResponse(204);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/reset-password?token=tok-1']);

    await user.type(await screen.findByLabelText('Nueva contraseña'), 'NuevaClave123!');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText('Contraseña actualizada. Inicia sesión con tu nueva contraseña.'),
    ).toBeVisible();
    await waitFor(() => expect(currentPath(router)).toBe('/login'));
    expect(apiCalls(isReset)[0].body).toEqual({ token: 'tok-1', password: 'NuevaClave123!' });
  });

  it('shows an actionable state on 410 with a way to request a new link', async () => {
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isReset(call)) return problemJson(410, 'El token de recuperación expiró.');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/reset-password?token=tok-expired']);

    await user.type(await screen.findByLabelText('Nueva contraseña'), 'NuevaClave123!');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText('El enlace de recuperación expiró. Solicita uno nuevo.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toBeVisible();
  });

  it('shows the invalid state on 404 (token unknown or already used)', async () => {
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isReset(call)) return problemJson(404, 'Token inválido.');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/reset-password?token=tok-unknown']);

    await user.type(await screen.findByLabelText('Nueva contraseña'), 'NuevaClave123!');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText('El enlace de recuperación no es válido o ya fue usado.'),
    ).toBeVisible();
  });
});
