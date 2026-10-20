import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';

import { storageKeys } from '@/lib/storage';
import { jsonResponse, setFetchHandler } from '@/test/fetch-stub';
import { ME_NO_SPACES, ME_ONE_SPACE, ME_TWO_SPACES } from '@/test/fixtures';
import { currentPath, renderApp } from '@/test/render-app';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');

function serveMe(me: typeof ME_TWO_SPACES) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, me);
    if (call.url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

describe('space resolution (F0-D1)', () => {
  it('shows the no-spaces screen with 0 memberships (AC-F0.6)', async () => {
    serveMe(ME_NO_SPACES);
    renderApp(['/']);

    expect(await screen.findByText('Sin espacios disponibles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
  });

  it('blocks /app when there are no spaces, landing on the no-spaces screen', async () => {
    serveMe(ME_NO_SPACES);
    const { router } = renderApp(['/app/orders']);

    expect(await screen.findByText('Sin espacios disponibles')).toBeInTheDocument();
    expect(currentPath(router)).toBe('/');
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
  });

  it('logs out from the no-spaces screen, always landing on /login (spec F0 §11)', async () => {
    serveMe(ME_NO_SPACES);
    const user = userEvent.setup();
    const { router } = renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/login');
  });

  it('auto-selects the single membership and enters the shell (AC-F0.2)', async () => {
    serveMe(ME_ONE_SPACE);
    const { router } = renderApp(['/']);

    expect(await screen.findByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
  });

  it('lists the spaces and lets you pick one with the keyboard (AC-F0.5)', async () => {
    serveMe(ME_TWO_SPACES);
    const user = userEvent.setup();
    const { router } = renderApp(['/']);

    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Gestión Demo' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
    expect(window.localStorage.getItem(storageKeys.activeCompany)).toBe('c-1');
  });

  it('persists the active space and invalidates the previous space queries (AC-F0.5)', async () => {
    serveMe(ME_TWO_SPACES);
    const user = userEvent.setup();
    const { queryClient, router } = renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Gestión Demo' }));
    expect(currentPath(router)).toBe('/app');

    // Simulate space-scoped queries with the ['company', companyId, ...] prefix.
    queryClient.setQueryData(['company', 'c-1', 'reports'], { rows: [] });
    queryClient.setQueryData(['company', 'c-2', 'reports'], { rows: [] });

    // Back to the picker and switch to the other space.
    await router.navigate('/');
    expect(await screen.findByText('Activo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Taller Carla' }));

    expect(currentPath(router)).toBe('/app');
    expect(window.localStorage.getItem(storageKeys.activeCompany)).toBe('c-2');
    expect(queryClient.getQueryState(['company', 'c-1', 'reports'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['company', 'c-2', 'reports'])?.isInvalidated).toBe(false);
  });

  it('restores the persisted space on reload (AC-F0.5)', async () => {
    window.localStorage.setItem(storageKeys.activeCompany, 'c-2');
    serveMe(ME_TWO_SPACES);
    const { router } = renderApp(['/app']);

    expect(await screen.findByRole('heading', { name: 'Taller Carla', level: 1 })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
    expect(screen.getByRole('combobox', { name: 'Cambiar de espacio' })).toBeInTheDocument();
  });

  it('clears a revoked active space and returns to the picker (spec F0 §11)', async () => {
    window.localStorage.setItem(storageKeys.activeCompany, 'c-revoked');
    serveMe(ME_TWO_SPACES);
    const { router } = renderApp(['/app']);

    expect(await screen.findByText('Elige un espacio')).toBeInTheDocument();
    expect(currentPath(router)).toBe('/');
    expect(window.localStorage.getItem(storageKeys.activeCompany)).toBeNull();
  });

  it('keeps working when localStorage is unavailable (spec F0 §11)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    serveMe(ME_TWO_SPACES);
    const user = userEvent.setup();
    const { router } = renderApp(['/']);

    await user.click(await screen.findByRole('button', { name: 'Gestión Demo' }));

    expect(await screen.findByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/app');
  });
});
