import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ClientViewDto, MeResponseDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

const CLIENT: ClientViewDto = {
  id: 'cl-1',
  relationshipId: 'rel-1',
  name: 'Carla Cliente',
  email: 'carla.cliente@demo.test',
  phones: ['555-0100'],
  createdAt: '2026-10-02T10:00:00.000Z',
};

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isClientsList = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/clients');
const isPostClient = (call: { url: string; method: string }) =>
  call.method === 'POST' && call.url.includes('/companies/c-1/clients');

const ME_OWN_BUSINESS: MeResponseDto = {
  ...ME_TWO_SPACES,
  memberships: [
    { ...ME_TWO_SPACES.memberships[0], companyType: 'own_business' },
  ],
};

/** Own-business space `c-1` (§2.3); the clients endpoints answer per test. */
function serveClients(options: { clients?: ClientViewDto[]; create?: Response } = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_OWN_BUSINESS);
    if (isPostClient(call)) return options.create ?? jsonResponse(201, {});
    if (isClientsList(call)) return jsonResponse(200, options.clients ?? []);
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderClients() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/catalogs/clients']);
}

describe('own clients (spec F3 §2.1, AC-F3.1/AC-F3.7)', () => {
  it('lists the own clients with contact data (AC-F3.7)', async () => {
    serveClients({ clients: [CLIENT] });
    renderClients();

    expect(await screen.findByText('Carla Cliente')).toBeVisible();
    expect(screen.getByText('carla.cliente@demo.test · 555-0100')).toBeVisible();
  });

  it('registers a client and reports the emailed limited link (AC-F3.7)', async () => {
    serveClients({
      create: jsonResponse(201, {
        id: 'cl-9',
        relationshipId: 'rel-9',
        name: 'Nuevo Cliente',
        email: 'nuevo@demo.test',
        accessIssued: true,
      }),
    });
    const user = userEvent.setup();
    renderClients();

    await user.click(await screen.findByRole('button', { name: 'Registrar cliente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre y apellido'), 'Nuevo Cliente');
    await user.type(within(dialog).getByLabelText(/Correo electrónico/), 'nuevo@demo.test');
    await user.type(within(dialog).getByLabelText(/Teléfonos/), '555-0200');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      const post = apiCalls(isPostClient)[0];
      expect(post).toBeDefined();
      expect(post.body).toMatchObject({
        name: 'Nuevo Cliente',
        email: 'nuevo@demo.test',
        phones: ['555-0200'],
      });
    });
    expect(
      await screen.findByText(/Cliente registrado\. Enlace de acceso enviado por correo\./),
    ).toBeVisible();
  });

  it('shows the server 422 detail in the dialog without closing it', async () => {
    serveClients({
      create: problemJson(422, 'El correo ya está registrado.'),
    });
    const user = userEvent.setup();
    renderClients();

    await user.click(await screen.findByRole('button', { name: 'Registrar cliente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre y apellido'), 'Otro Cliente');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByText('El correo ya está registrado.')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
