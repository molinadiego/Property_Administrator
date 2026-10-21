import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  LimitedInvoiceViewDto,
  LimitedOrderViewDto,
  LimitedPropertyViewDto,
} from '@/api/types';
import { problemJson, jsonResponse, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

const TOKEN = 'tok-roberto-1';

const orderFixture = (over: Partial<LimitedOrderViewDto> = {}): LimitedOrderViewDto => ({
  id: 'o-1',
  title: 'Fuga bajo el lavadero',
  status: 'open',
  createdAt: '2026-10-10T08:00:00.000Z',
  ...over,
});

const propertyFixture = (over: Partial<LimitedPropertyViewDto> = {}): LimitedPropertyViewDto => ({
  id: 'p-1',
  addressLine: 'Calle Falsa 123',
  city: 'Springfield',
  state: 'IL',
  ...over,
});

const invoiceFixture = (over: Partial<LimitedInvoiceViewDto> = {}): LimitedInvoiceViewDto => ({
  id: 'inv-1',
  orderId: 'o-1',
  orderTitle: 'Fuga bajo el lavadero',
  status: 'issued',
  number: 7,
  issueDate: '2026-10-11',
  dueDate: '2026-11-10',
  subtotal: '100.00',
  taxRate: '21.00',
  taxTotal: '21.00',
  total: '121.00',
  notes: null,
  paidNet: '0.00',
  balance: '121.00',
  issuer: { companyId: 'c-1', name: 'Gestión Demo' },
  recipient: { kind: 'tenant', companyId: null, tenantId: 't-roberto', name: 'Roberto Díaz' },
  voidedAt: null,
  voidReason: null,
  payments: [],
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  ...over,
});

const isLimited = (call: { url: string }, path: string) =>
  call.url.includes(`/limited/${TOKEN}/${path}`);

interface ServeOptions {
  orders?: LimitedOrderViewDto[];
  ordersAfter?: LimitedOrderViewDto[];
  properties?: LimitedPropertyViewDto[];
  invoices?: LimitedInvoiceViewDto[];
  /** Every limited endpoint answers this (invalid/revoked token). */
  error?: Response;
}

/** The portal is public (no session): the token routes answer per test (F3 §8). */
function servePortal(options: ServeOptions = {}) {
  let posted = false;
  setFetchHandler((call) => {
    if (options.error && call.url.includes('/limited/')) return options.error;
    if (isLimited(call, 'requests') && call.method === 'POST') {
      posted = true;
      return jsonResponse(201, {
        id: 'o-9',
        title: 'Pedido del portal',
        status: 'requested',
      });
    }
    if (isLimited(call, 'orders') && call.method === 'GET') {
      const rows = posted && options.ordersAfter ? options.ordersAfter : options.orders;
      return jsonResponse(200, rows ?? []);
    }
    if (isLimited(call, 'properties') && call.method === 'GET') {
      return jsonResponse(200, options.properties ?? []);
    }
    if (isLimited(call, 'invoices') && call.method === 'GET') {
      return jsonResponse(200, options.invoices ?? []);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderPortal() {
  return renderApp([`/limited/${TOKEN}`]);
}

describe('limited portal (spec F3 §2.2, AC-F3.8/AC-F3.10)', () => {
  it('renders the invalid-link screen on 401 — never a login redirect (AC-F3.10)', async () => {
    servePortal({ error: problemJson(401, 'El enlace expiró o fue revocado.') });
    renderPortal();

    expect(
      await screen.findByRole('heading', { name: 'Este enlace ya no es válido' }),
    ).toBeVisible();
    expect(screen.getByText(/Pide uno nuevo a tu profesional/)).toBeVisible();
  });

  it('lists the orders with the BE-2 R5 labels and no cost data (AC-F3.8)', async () => {
    servePortal({
      orders: [
        orderFixture({ id: 'o-1', status: 'open' }),
        orderFixture({ id: 'o-2', title: 'Revisión eléctrica', status: 'in_progress' }),
      ],
    });
    renderPortal();

    expect(await screen.findByText('Fuga bajo el lavadero')).toBeVisible();
    expect(screen.getByText('Revisión eléctrica')).toBeVisible();
    expect(screen.getByText('Enviada')).toBeVisible();
    expect(screen.getByText('En curso')).toBeVisible();
    // §4.3: status only — no money fields render anywhere in the portal.
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('places a work request and the row appears as «Borrador» (AC-F3.8)', async () => {
    servePortal({
      properties: [propertyFixture()],
      ordersAfter: [orderFixture({ id: 'o-9', title: 'Pedido del portal', status: 'requested' })],
    });
    const user = userEvent.setup();
    renderPortal();

    await user.click(await screen.findByRole('combobox', { name: 'Propiedad' }));
    await user.click(
      await screen.findByRole('option', { name: 'Calle Falsa 123 (Springfield)' }),
    );
    await user.type(screen.getByLabelText('Título'), 'Fuga bajo el lavadero');
    await user.type(screen.getByLabelText('Descripción'), 'Apenas sale agua, ya está mojando el piso.');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => {
      const post = screen.getByText(/Pedido registrado/);
      expect(post).toBeVisible();
    });
    expect(await screen.findByText('Borrador')).toBeVisible();
  });

  it('shows guidance instead of the form when the account has no properties (AC-F3.8)', async () => {
    servePortal({ properties: [] });
    renderPortal();

    expect(await screen.findByText('Sin propiedades vinculadas')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar pedido' })).not.toBeInTheDocument();
  });

  it('renders the invoices section only when the server sent at least one (AC-F3.11)', async () => {
    servePortal({ invoices: [invoiceFixture()] });
    renderPortal();

    const link = await screen.findByRole('link', { name: 'Ver factura N.º 7' });
    expect(link).toBeVisible();
    expect(screen.getByText('Emitida')).toBeVisible();
  });

  it('hides the invoices section entirely when the list is empty (AC-F3.11)', async () => {
    servePortal({ invoices: [] });
    renderPortal();

    await screen.findByText('Aún no tienes órdenes registradas.');
    expect(screen.queryByText('Facturas')).not.toBeInTheDocument();
  });
});
