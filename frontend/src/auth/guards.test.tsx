import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { LOGIN_USER, ME_TWO_SPACES } from '@/test/fixtures';
import { currentPath, renderApp } from '@/test/render-app';

const isLogin = (call: { url: string; method: string }) =>
  call.url.endsWith('/auth/login') && call.method === 'POST';
const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');

describe('route guards', () => {
  it('redirects to /login and returns to the requested route after login (AC-F0.1)', async () => {
    let meCalls = 0;
    setFetchHandler((call) => {
      if (isMe(call)) {
        return meCalls++ === 0 ? problemJson(401, 'Unauthorized') : jsonResponse(200, ME_TWO_SPACES);
      }
      if (isLogin(call)) return jsonResponse(200, { user: LOGIN_USER });
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    const { router } = renderApp(['/app/orders']);

    expect(await screen.findByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(currentPath(router)).toBe('/login');

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@demo.test');
    await user.type(screen.getByLabelText('Contraseña'), 'DevDemo123!');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    // No active space yet → picker, remembering /app/orders.
    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Taller Carla' }));

    expect(await screen.findByText('Disponible en la etapa F4.')).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app/orders');
  });

  it('shows the session error screen (with retry) on network failure, not login (AC-F0.4)', async () => {
    setFetchHandler(() => {
      throw new TypeError('fetch failed');
    });
    const { router } = renderApp(['/app']);

    // One automatic retry (~1s) happens before the error screen appears.
    expect(
      await screen.findByText('No pudimos cargar tu sesión.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
  });

  it('shows the error screen (not login) on 5xx and does not leak server data', async () => {
    setFetchHandler(() => problemJson(500, 'stack trace interna del servidor'));
    const { router } = renderApp(['/app']);

    expect(
      await screen.findByText('No pudimos cargar tu sesión.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('stack trace interna del servidor')).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
  });

  it('redirects an authenticated user away from /login to the active space (F0-D2)', async () => {
    window.localStorage.setItem('hm.activeCompany', 'c-2');
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/login']);

    expect(await screen.findByRole('heading', { name: 'Taller Carla', level: 1 })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
  });
});
