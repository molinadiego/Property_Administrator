import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { OrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, MEMBERS_GESTION, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

// ---------------------------------------------------------------------------
// Fixtures (spec F4 §8): shapes mirror the generated client DTOs.
// ---------------------------------------------------------------------------

const assignment = (
  id: string,
  assigneeMembershipId: string,
  status: OrderViewDto['jobs'][number]['assignments'][number]['status'],
  over: Partial<OrderViewDto['jobs'][number]['assignments'][number]> = {},
): OrderViewDto['jobs'][number]['assignments'][number] => ({
  id,
  status,
  assigneeMembershipId,
  respondedAt: null,
  rejectionReason: null,
  createdAt: '2026-10-11T09:00:00.000Z',
  ...over,
});

const job = (
  id: string,
  status: OrderViewDto['jobs'][number]['status'],
  assignments: OrderViewDto['jobs'][number]['assignments'],
  over: Partial<OrderViewDto['jobs'][number]> = {},
): OrderViewDto['jobs'][number] => ({
  id,
  title: `Trabajo ${id}`,
  description: 'Trabajo demo',
  sortOrder: 1,
  status,
  startedAt: null,
  completedAt: null,
  assignments,
  ...over,
});

const orderFixture = (over: Partial<OrderViewDto> = {}): OrderViewDto => ({
  id: 'o-1',
  title: 'Reparar triturador',
  description: 'No tritura, hace ruido.',
  status: 'open',
  urgent: false,
  origin: 'management',
  propertyId: 'p-1',
  companyId: 'c-1',
  parentOrderId: null,
  closedBy: null,
  closedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  cancellationReason: null,
  access: null,
  jobs: [],
  createdAt: '2026-10-12T10:00:00.000Z',
  ...over,
});

const MY_MEMBERSHIP = 'mem-ana-c1';

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isDetail = (call: { url: string; method: string }) =>
  call.method === 'GET' && /\/companies\/c-1\/orders\/o-/.test(call.url);
const isMembers = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/members');
const isProperties = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');

interface ServeDetailOptions {
  detail?: Response;
  /** Response of POST …/jobs/j-1/start (default 204). */
  start?: Response;
}

/** Active space `c-1`; detail + supporting catalogs + transitions per test. */
function serveDetail(order: OrderViewDto, options: ServeDetailOptions = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isDetail(call)) return options.detail ?? jsonResponse(200, order);
    if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
    if (isProperties(call)) return jsonResponse(200, [PROPERTY_P1]);
    if (call.method === 'POST' && call.url.includes('/assignments/a-1/accept')) {
      return jsonResponse(204);
    }
    if (call.method === 'POST' && call.url.includes('/assignments/a-1/reject')) {
      return jsonResponse(204);
    }
    if (call.method === 'POST' && call.url.includes('/jobs/j-1/start')) {
      return options.start ?? jsonResponse(204);
    }
    if (call.method === 'POST' && call.url.includes('/orders/o-1/convert')) {
      return jsonResponse(201, { id: 'o-1', status: 'open' });
    }
    if (call.method === 'POST' && call.url.includes('/orders/o-1/cancel')) {
      return jsonResponse(204);
    }
    if (call.method === 'POST' && call.url.includes('/orders/o-1/jobs')) {
      return jsonResponse(201, {
        id: 'j-2',
        orderId: 'o-1',
        title: 'Segundo trabajo',
        sortOrder: 2,
        status: 'pending',
      });
    }
    if (call.method === 'POST' && call.url.includes('/orders/o-1/assignments')) {
      return jsonResponse(201, { id: 'a-9', jobId: 'j-1', status: 'pending' });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderDetail(orderId = 'o-1') {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp([`/app/orders/${orderId}`]);
}

describe('order detail (spec F4 §2.3, AC-F4.4…AC-F4.10)', () => {
  it('renders the header, the job and the responsible actions of the plan', async () => {
    serveDetail(
      orderFixture({
        jobs: [job('j-1', 'pending', [assignment('a-1', 'm-bob', 'pending')])],
      }),
    );
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Reparar triturador' })).toBeVisible();
    expect(screen.getByText('Enviada')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
    // Assignment history resolves the member name (§5.7).
    expect(screen.getByText(/Propuesta/)).toBeVisible();
    expect(screen.getByText(/Asignado a: Bob Contratista/)).toBeVisible();

    // Responsible decisions (own space, no work started, nothing terminal).
    expect(screen.getByRole('button', { name: 'Editar instrucciones' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar orden' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar trabajo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Revocar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'No pudo concretarse' })).toBeVisible();
    // Not offered in this state (server would 409/403, §16.1).
    expect(screen.queryByRole('button', { name: 'Cerrar orden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Convertir y enviar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar' })).toBeNull();
    // Access block renders only when the server sent it (§4.5).
    expect(screen.queryByText('Datos de acceso de la visita')).toBeNull();
  });

  it('shows the access block only when the server sends it (AC-F4.10)', async () => {
    serveDetail(
      orderFixture({
        access: { lockbox: '1234#', communityCode: '7788', entryInstructions: 'Timbre 2.' },
      }),
    );
    renderDetail();

    expect(await screen.findByText('Datos de acceso de la visita')).toBeVisible();
    expect(screen.getByText('1234#')).toBeVisible();
    expect(screen.getByText('Timbre 2.')).toBeVisible();
  });

  it('accepts the own pending assignment through its confirmation (AC-F4.4)', async () => {
    serveDetail(
      orderFixture({
        jobs: [job('j-1', 'pending', [assignment('a-1', MY_MEMBERSHIP, 'pending')])],
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Aceptar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      const accept = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/assignments/a-1/accept'),
      );
      expect(accept).toHaveLength(1);
    });
    // The mutation invalidates the detail → a fresh GET follows (§5).
    await waitFor(() => expect(apiCalls(isDetail).length).toBeGreaterThanOrEqual(2));
  });

  it('rejects with the optional reason ≤1000 (AC-F4.5)', async () => {
    serveDetail(
      orderFixture({
        jobs: [job('j-1', 'pending', [assignment('a-1', MY_MEMBERSHIP, 'pending')])],
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Motivo (opcional)'), 'Estoy de viaje.');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

    await waitFor(() => {
      const reject = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/assignments/a-1/reject'),
      );
      expect(reject).toHaveLength(1);
      expect(reject[0].body).toEqual({ reason: 'Estoy de viaje.' });
    });
  });

  it('converts a requested order into a sent one (AC-F4.9)', async () => {
    serveDetail(orderFixture({ status: 'requested', jobs: [] }));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Convertir y enviar' }));
    await waitFor(() => {
      const convert = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/orders/o-1/convert'),
      );
      expect(convert).toHaveLength(1);
    });
  });

  it('requires the reason before cancelling and sends it (AC-F4.8)', async () => {
    serveDetail(orderFixture());
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancelar orden' }));
    const dialog = await screen.findByRole('dialog');
    // Required field blocks the empty submit (mirror of CancelOrderDto).
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar orden' }));
    expect(await within(dialog).findByText('Este campo es obligatorio.')).toBeVisible();
    expect(
      apiCalls((call) => call.method === 'POST' && call.url.includes('/orders/o-1/cancel')),
    ).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Motivo'), 'El cliente se retiró.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar orden' }));
    await waitFor(() => {
      const cancel = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/orders/o-1/cancel'),
      );
      expect(cancel).toHaveLength(1);
      expect(cancel[0].body).toEqual({ reason: 'El cliente se retiró.' });
    });
  });

  it('surfaces a 409 as the server detail and refetches (AC-F4.12)', async () => {
    serveDetail(
      orderFixture({
        jobs: [
          job('j-1', 'accepted', [assignment('a-1', MY_MEMBERSHIP, 'accepted')], {
            startedAt: null,
          }),
        ],
      }),
      { start: problemJson(409, 'El trabajo no está en un estado válido.') },
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Iniciar' }));
    expect(await screen.findByText('El trabajo no está en un estado válido.')).toBeVisible();
    await waitFor(() => expect(apiCalls(isDetail).length).toBeGreaterThanOrEqual(2));
  });

  it('offers no responsible action on a foreign order (AC-F4.10)', async () => {
    serveDetail(
      orderFixture({
        companyId: 'c-2',
        jobs: [job('j-1', 'pending', [assignment('a-1', MY_MEMBERSHIP, 'pending')])],
      }),
    );
    const user = userEvent.setup();
    renderDetail();

    // The own assignment still drives the assignee actions (§2.3).
    expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeVisible();
    // Responsible decisions of the owning space are never offered here.
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar orden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agregar trabajo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).toBeNull();

    // «Editar instrucciones» opens without the urgent toggle (§14.2 → 403 here).
    await user.click(screen.getByRole('button', { name: 'Editar instrucciones' }));
    const editDialog = await screen.findByRole('dialog');
    expect(
      within(editDialog).queryByLabelText('Marcar como urgente'),
    ).toBeNull();
  });

  it('creates the assign proposal for a free job (AC-F4.5)', async () => {
    serveDetail(orderFixture({ jobs: [job('j-1', 'pending', [])] }));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Asignar a' }));
    // The select content portals outside the dialog (Radix), like in F1 tests.
    await user.click(await screen.findByRole('option', { name: 'Bob Contratista' }));
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() => {
      const assign = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/orders/o-1/assignments'),
      );
      expect(assign).toHaveLength(1);
      expect(assign[0].body).toEqual({
        jobId: 'j-1',
        assigneeMembershipId: 'm-bob',
      });
    });
  });

  it('adds a job to the compound order (§5.5)', async () => {
    serveDetail(orderFixture({ jobs: [job('j-1', 'pending', [])] }));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Agregar trabajo' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Título del trabajo'), 'Segundo trabajo');
    await user.type(within(dialog).getByLabelText('Descripción del trabajo'), 'Otra visita.');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar trabajo' }));

    await waitFor(() => {
      const addJob = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/orders/o-1/jobs'),
      );
      expect(addJob).toHaveLength(1);
      expect(addJob[0].body).toEqual({
        title: 'Segundo trabajo',
        description: 'Otra visita.',
      });
    });
  });

  it('renders the not-found screen without leaking data (AC-F4.10)', async () => {
    serveDetail(orderFixture(), { detail: problemJson(404, 'Orden no encontrada.') });
    const user = userEvent.setup();
    const { router } = renderDetail('o-missing');

    expect(await screen.findByText('Orden no encontrada o sin acceso')).toBeVisible();
    expect(screen.queryByText('Reparar triturador')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Volver a órdenes' }));
    await waitFor(() => expect(currentPath(router)).toBe('/app/orders'));
  });
});
