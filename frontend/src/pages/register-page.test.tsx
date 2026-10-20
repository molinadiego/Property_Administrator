import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

const isRegister = (call: { url: string; method: string }) =>
  call.url.endsWith('/auth/register') && call.method === 'POST';
const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');

/** Guest (`/auth/me` → 401); the register endpoint answers per test. */
function serveGuest() {
  setFetchHandler((call) => {
    if (isMe(call)) return problemJson(401, 'Unauthorized');
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Nombre'), 'Nueva Persona');
  await user.type(screen.getByLabelText('Correo electrónico'), 'nueva@demo.test');
  await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!');
}

describe('register (spec F1 §2, AC-F1.1)', () => {
  it('validates required fields and never calls the API on failure', async () => {
    serveGuest();
    const user = userEvent.setup();
    renderApp(['/register']);

    await user.click(await screen.findByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ingresa tu nombre.')).toBeVisible();
    expect(screen.getByText('Ingresa tu correo electrónico.')).toBeVisible();
    expect(screen.getByText('Ingresa una contraseña.')).toBeVisible();
    expect(apiCalls(isRegister)).toHaveLength(0);
  });

  it('lands on login with a notice on 201 (no session is created, F1-D5)', async () => {
    serveGuest();
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isRegister(call)) {
        return jsonResponse(201, {
          id: 'u-new',
          email: 'nueva@demo.test',
          name: 'Nueva Persona',
        });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const { router } = renderApp(['/register']);

    await fillForm(user);
    await user.click(await screen.findByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Cuenta creada. Inicia sesión para continuar.')).toBeVisible();
    await waitFor(() => expect(currentPath(router)).toBe('/login'));
    expect(apiCalls(isRegister)[0].body).toEqual({
      email: 'nueva@demo.test',
      name: 'Nueva Persona',
      password: 'Secreta123!',
    });
  });

  it('shows the RFC 7807 detail under the email on 409 (AC-F1.1)', async () => {
    serveGuest();
    const user = userEvent.setup();
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isRegister(call)) {
        return problemJson(409, 'Ya existe una cuenta con ese correo.');
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderApp(['/register']);

    await fillForm(user);
    await user.click(await screen.findByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ya existe una cuenta con ese correo.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  });
});
