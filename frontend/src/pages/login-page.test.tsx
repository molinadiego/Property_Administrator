import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { LOGIN_USER, ME_TWO_SPACES } from '@/test/fixtures';
import { currentPath, renderApp } from '@/test/render-app';

const isLogin = (call: { url: string; method: string }) =>
  call.url.endsWith('/auth/login') && call.method === 'POST';
const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');

/** Guest (`/auth/me` → 401) that logs in successfully (→ 2 spaces). */
function handlerWithSuccessfulLogin() {
  let meCalls = 0;
  setFetchHandler((call) => {
    if (isMe(call)) {
      return meCalls++ === 0 ? problemJson(401, 'Unauthorized') : jsonResponse(200, ME_TWO_SPACES);
    }
    if (isLogin(call)) return jsonResponse(200, { user: LOGIN_USER });
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@demo.test');
  await user.type(screen.getByLabelText('Contraseña'), 'DevDemo123!');
}

describe('LoginPage', () => {
  it('validates on submit without hitting the API', async () => {
    handlerWithSuccessfulLogin();
    const user = userEvent.setup();
    renderApp(['/login']);

    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Ingresa tu correo electrónico.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(apiCalls(isLogin)).toHaveLength(0);
  });

  it('logs in and lands on the space picker (AC-F0.3)', async () => {
    handlerWithSuccessfulLogin();
    const user = userEvent.setup();
    renderApp(['/login']);

    await fillCredentials(user);
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
    expect(apiCalls(isLogin)).toHaveLength(1);
  });

  it('can be submitted with the keyboard (accessible form)', async () => {
    handlerWithSuccessfulLogin();
    const user = userEvent.setup();
    renderApp(['/login']);

    await screen.findByLabelText('Correo electrónico');
    await user.tab();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    await user.keyboard('ana@demo.test');
    await user.tab();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    await user.keyboard('DevDemo123!');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
  });

  it('shows the credentials message on 401 and re-enables the form (AC-F0.3)', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isLogin(call)) return problemJson(401, 'Bad credentials');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderApp(['/login']);

    await fillCredentials(user);
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByText('Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
  });

  it('shows the RFC 7807 detail on 422', async () => {
    setFetchHandler((call) => {
      if (isMe(call)) return problemJson(401, 'Unauthorized');
      if (isLogin(call)) return problemJson(422, 'email debe incluir el símbolo @');
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderApp(['/login']);

    await fillCredentials(user);
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('email debe incluir el símbolo @')).toBeInTheDocument();
  });

  it('disables the submit button while pending and never double-submits', async () => {
    let meCalls = 0;
    let resolveLogin: ((response: Response) => void) | undefined;
    setFetchHandler((call) => {
      if (isMe(call)) {
        return meCalls++ === 0 ? problemJson(401, 'Unauthorized') : jsonResponse(200, ME_TWO_SPACES);
      }
      if (isLogin(call)) {
        return new Promise<Response>((resolve) => {
          resolveLogin = resolve;
        });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderApp(['/login']);

    await fillCredentials(user);
    const submit = await screen.findByRole('button', { name: 'Iniciar sesión' });
    await user.click(submit);

    expect(await screen.findByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    await user.click(submit);
    await user.click(submit);
    expect(apiCalls(isLogin)).toHaveLength(1);

    resolveLogin?.(jsonResponse(200, { user: LOGIN_USER }));
    await waitFor(() => expect(screen.getByText('Elige un espacio')).toBeInTheDocument());
  });

  it('returns to a validated internal ?next= after login (F1-D6)', async () => {
    handlerWithSuccessfulLogin();
    const user = userEvent.setup();
    const { router } = renderApp(['/login?next=/app']);

    await fillCredentials(user);
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(currentPath(router)).toBe('/app'));
  });

  it('ignores an external ?next= (protocol-relative URL, F1-D6)', async () => {
    handlerWithSuccessfulLogin();
    const user = userEvent.setup();
    const { router } = renderApp(['/login?next=//evil.example.com']);

    await fillCredentials(user);
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
    expect(currentPath(router)).toBe('/');
  });
});
