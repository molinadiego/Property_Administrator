import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { MeResponseDto, OrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, MEMBERS_GESTION, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

const CREATED_ORDER_ID = 'o-9';

const orderFixture = (over: Partial<OrderViewDto> = {}): OrderViewDto => ({
  id: CREATED_ORDER_ID,
  title: 'Orden creada',
  description: 'Descripción',
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
  createdAt: '2026-10-14T10:00:00.000Z',
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isPropertiesList = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');
const isCreateOrder = (call: { url: string; method: string }) =>
  call.method === 'POST' && call.url.includes('/companies/c-1/orders');

/** Active space `c-1`; the create endpoint answers per test (spec F4 §8). */
function serveNewOrder(options: { create?: Response; me?: MeResponseDto } = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, options.me ?? ME_TWO_SPACES);
    if (isPropertiesList(call)) return jsonResponse(200, [PROPERTY_P1]);
    if (call.method === 'GET' && call.url.includes('/companies/c-1/clients')) {
      return jsonResponse(200, []);
    }
    if (call.method === 'GET' && call.url.includes('/companies/c-1/members')) {
      return jsonResponse(200, MEMBERS_GESTION);
    }
    if (isCreateOrder(call)) return options.create ?? jsonResponse(201, orderFixture());
    if (call.method === 'GET' && call.url.includes(`/orders/${CREATED_ORDER_ID}`)) {
      return jsonResponse(200, orderFixture());
    }
    if (call.method === 'PATCH' && call.url.includes('/orders/')) return jsonResponse(200, orderFixture({ urgent: true }));
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderNewOrder() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/orders/new']);
}

/** Picks the property in the Radix select and fills the required texts. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Propiedad' }));
  await user.click(await screen.findByRole('option', { name: 'Calle Falsa 123' }));
  await user.type(screen.getByLabelText('Título'), 'Revisar térmica');
  await user.type(screen.getByLabelText('Descripción'), 'Salta el diferencial.');
}

describe('order creation (spec F4 §2.2, AC-F4.3)', () => {
  it('blocks the submit until property, title and description are set', async () => {
    serveNewOrder();
    const user = userEvent.setup();
    renderNewOrder();

    await user.click(await screen.findByRole('button', { name: 'Crear orden' }));
    expect(await screen.findAllByText('Este campo es obligatorio.')).not.toHaveLength(0);
    expect(apiCalls(isCreateOrder)).toHaveLength(0);
  });

  it('creates the order bound to the property and lands on the detail (AC-F4.3)', async () => {
    serveNewOrder();
    const user = userEvent.setup();
    const { router } = renderNewOrder();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    await waitFor(() => expect(apiCalls(isCreateOrder)).toHaveLength(1));
    expect(apiCalls(isCreateOrder)[0].body).toMatchObject({
      propertyId: 'p-1',
      title: 'Revisar térmica',
      description: 'Salta el diferencial.',
    });
    await waitFor(() =>
      expect(currentPath(router)).toBe(`/app/orders/${CREATED_ORDER_ID}`),
    );
  });

  it('marks the order urgent with the follow-up PATCH (CreateOrderDto has no field)', async () => {
    serveNewOrder();
    const user = userEvent.setup();
    const { router } = renderNewOrder();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('checkbox', { name: 'Marcar como urgente' }));
    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    await waitFor(() => {
      const patch = apiCalls(
        (call) => call.method === 'PATCH' && call.url.includes(`/orders/${CREATED_ORDER_ID}`),
      );
      expect(patch).toHaveLength(1);
      expect(patch[0].body).toEqual({ urgent: true });
    });
    await waitFor(() =>
      expect(currentPath(router)).toBe(`/app/orders/${CREATED_ORDER_ID}`),
    );
  });

  it('offers the own-client select only to own_business spaces (§2.3)', async () => {
    const ownBusinessMe: MeResponseDto = {
      ...ME_TWO_SPACES,
      memberships: [
        {
          id: 'mem-ana-c3',
          companyId: 'c-3',
          companyName: 'Taller Propio',
          companyType: 'own_business',
          role: 'owner',
          joinedAt: '2026-01-15T10:30:00.000Z',
        },
      ],
    };
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ownBusinessMe);
      if (call.method === 'GET' && call.url.includes('/companies/c-3/properties')) {
        return jsonResponse(200, [PROPERTY_P1]);
      }
      if (call.method === 'GET' && call.url.includes('/companies/c-3/clients')) {
        return jsonResponse(200, []);
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    window.localStorage.setItem(storageKeys.activeCompany, 'c-3');
    renderApp(['/app/orders/new']);

    expect(await screen.findByLabelText('Cliente propio (opcional)')).toBeVisible();
  });

  it('shows the RFC 7807 detail when the server rejects the order (422)', async () => {
    serveNewOrder({ create: problemJson(422, 'La propiedad no existe.') });
    const user = userEvent.setup();
    const { router } = renderNewOrder();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    expect(await screen.findByText('La propiedad no existe.')).toBeVisible();
    // Never navigates on failure: the form stays for a corrected retry.
    expect(currentPath(router)).toBe('/app/orders/new');
  });
});
