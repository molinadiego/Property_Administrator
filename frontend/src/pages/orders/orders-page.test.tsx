import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { OrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, MEMBERS_GESTION, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

/** Shapes mirror the generated client DTOs (spec F4 §8). */
const orderFixture = (over: Partial<OrderViewDto> = {}): OrderViewDto => ({
  id: 'o-1',
  title: 'Reparar triturador',
  description: 'No tritura.',
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

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isOrderDetail = (call: { url: string; method: string }) =>
  call.method === 'GET' && /\/companies\/c-1\/orders\/o-/.test(call.url);
const isOrdersList = (call: { url: string; method: string }) =>
  call.method === 'GET' &&
  call.url.includes('/companies/c-1/orders') &&
  !call.url.includes('/orders/o-');
const isPropertiesList = (call: { url: string; method: string }) =>
  call.method === 'GET' &&
  call.url.includes('/companies/c-1/properties') &&
  !call.url.includes('/properties/p-');
const isMembers = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/members');

/** Active space `c-1`; list, detail and supporting catalogs answer per test. */
function serveOrders(options: { orders?: OrderViewDto[]; error?: Response } = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isOrderDetail(call)) return jsonResponse(200, options.orders?.[0] ?? orderFixture());
    if (isOrdersList(call)) return options.error ?? jsonResponse(200, options.orders ?? []);
    if (isPropertiesList(call)) return jsonResponse(200, [PROPERTY_P1]);
    if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderOrders(search = '/app/orders') {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp([search]);
}

describe('order list (spec F4 §2.1, AC-F4.1/AC-F4.2)', () => {
  it('filters by status through BE-1 and keeps it in the query string', async () => {
    serveOrders({ orders: [orderFixture()] });
    const user = userEvent.setup();
    const { router } = renderOrders();

    await screen.findByRole('link', { name: 'Abrir orden: Reparar triturador' });
    await user.click(screen.getByRole('button', { name: 'Borrador' }));

    await waitFor(() => {
      const requested = apiCalls(
        (call) => isOrdersList(call) && call.url.includes('status=requested'),
      );
      expect(requested.length).toBeGreaterThan(0);
    });
    await waitFor(() => expect(currentPath(router)).toBe('/app/orders?status=requested'));
  });

  it('combines the pending toggle with the state chip (AND, BE-1 §5)', async () => {
    serveOrders({ orders: [] });
    const user = userEvent.setup();
    renderOrders();

    await screen.findByRole('button', { name: 'Todas' });
    await user.click(screen.getByRole('button', { name: 'En curso' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mis pendientes de aceptar' }));

    await waitFor(() => {
      const combined = apiCalls(
        (call) =>
          isOrdersList(call) &&
          call.url.includes('status=in_progress') &&
          call.url.includes('assignment_status=pending'),
      );
      expect(combined.length).toBeGreaterThan(0);
    });
  });

  it('shows the address of own orders and hides it for foreign rows (AC-F4.2)', async () => {
    serveOrders({
      orders: [
        orderFixture({ id: 'o-1', title: 'Orden propia' }),
        orderFixture({
          id: 'o-2',
          title: 'Orden asignada',
          companyId: 'c-2',
          propertyId: 'p-foreign',
        }),
      ],
    });
    renderOrders();

    expect(await screen.findByText('Orden propia')).toBeVisible();
    expect(screen.getByText(/Calle Falsa 123/)).toBeVisible();
    // Foreign rows carry no address: the contract has no summary endpoint.
    expect(screen.getByText('Orden asignada')).toBeVisible();
    expect(screen.getAllByText(/Calle Falsa 123/)).toHaveLength(1);
  });

  it('opens the detail from a row', async () => {
    serveOrders({ orders: [orderFixture()] });
    const user = userEvent.setup();
    const { router } = renderOrders();

    await user.click(await screen.findByRole('link', { name: 'Abrir orden: Reparar triturador' }));
    await waitFor(() => expect(currentPath(router)).toBe('/app/orders/o-1'));
  });

  it('«Nueva orden» opens the creation form (F2-D7)', async () => {
    serveOrders({ orders: [orderFixture()] });
    const user = userEvent.setup();
    const { router } = renderOrders();

    await user.click(await screen.findByRole('link', { name: 'Nueva orden' }));
    await waitFor(() => expect(currentPath(router)).toBe('/app/orders/new'));
  });

  it('distinguishes empty from filtered-empty and offers «Limpiar filtros»', async () => {
    serveOrders({ orders: [] });
    const user = userEvent.setup();
    renderOrders('/app/orders?status=completed');

    expect(await screen.findByText('Ninguna orden coincide con estos filtros.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Aún no hay órdenes en este espacio.')).toBeVisible();
  });

  it('shows the RFC 7807 detail on error and offers retry', async () => {
    serveOrders({ error: problemJson(403, 'No tienes acceso a este espacio.') });
    renderOrders();

    expect(await screen.findByText('No tienes acceso a este espacio.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  it('documents the server cap of 100 (BE-1 §1.1)', async () => {
    serveOrders({
      orders: Array.from({ length: 100 }, (_unused, index) =>
        orderFixture({ id: `o-${index}`, title: `Orden ${index}` }),
      ),
    });
    renderOrders();

    expect(await screen.findByText('100+')).toBeVisible();
    expect(
      screen.getAllByText('Se muestran las 100 órdenes más recientes').length,
    ).toBeGreaterThan(0);
  });
});
