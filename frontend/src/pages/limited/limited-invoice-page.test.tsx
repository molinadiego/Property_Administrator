import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LimitedInvoiceDetailViewDto } from '@/api/types';
import { problemJson, jsonResponse, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

const TOKEN = 'tok-roberto-1';
const INVOICE_ID = 'inv-1';

const invoiceDetail = (
  over: Partial<LimitedInvoiceDetailViewDto> = {},
): LimitedInvoiceDetailViewDto => ({
  id: INVOICE_ID,
  orderId: 'o-1',
  orderTitle: 'Fuga bajo el lavadero',
  status: 'partially_paid',
  number: 7,
  issueDate: '2026-10-11',
  dueDate: '2026-11-10',
  subtotal: '100.00',
  taxRate: '21.00',
  taxTotal: '21.00',
  total: '121.00',
  notes: null,
  paidNet: '50.00',
  balance: '71.00',
  issuer: { companyId: 'c-1', name: 'Gestión Demo' },
  recipient: { kind: 'tenant', companyId: null, tenantId: 't-roberto', name: 'Roberto Díaz' },
  voidedAt: null,
  voidReason: null,
  payments: [
    {
      id: 'pay-1',
      kind: 'charge',
      status: 'recorded',
      amount: '50.00',
      paidAt: '2026-10-12',
      method: 'transfer',
      reference: null,
      notes: null,
      duplicateOfId: null,
      reconciledAt: null,
      registeredByCompanyId: 'c-1',
      createdAt: '2026-10-12T10:00:00.000Z',
    },
  ],
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
  lines: [
    {
      id: 'line-1',
      jobId: 'j-1',
      jobTitle: 'Visita técnica',
      kind: 'labor',
      description: 'Mano de obra de la reparación',
      amount: '80.00',
      taxable: true,
    },
    {
      id: 'line-2',
      jobId: 'j-1',
      jobTitle: 'Visita técnica',
      kind: 'material',
      description: 'Materiales varios',
      amount: '20.00',
      taxable: true,
    },
  ],
  ...over,
});

/** Public portal route: the invoice endpoints answer per test (F3 §8). */
function serveInvoice(options: { detail?: LimitedInvoiceDetailViewDto; error?: Response } = {}) {
  setFetchHandler((call) => {
    if (call.url.includes(`/limited/${TOKEN}/invoices/${INVOICE_ID}`)) {
      return options.error ?? jsonResponse(200, options.detail ?? invoiceDetail());
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderInvoice() {
  return renderApp([`/limited/${TOKEN}/invoices/${INVOICE_ID}`]);
}

describe('portal invoice detail (spec F3 §2.2, AC-F3.11)', () => {
  it('shows status, totals, lines and recorded payments (AC-F3.11)', async () => {
    serveInvoice();
    renderInvoice();

    expect(await screen.findByRole('heading', { name: /Factura N.º 7/ })).toBeVisible();
    expect(screen.getByText('Parcialmente pagada')).toBeVisible();
    expect(screen.getByText('USD 121.00')).toBeVisible(); // total
    expect(screen.getByText('USD 71.00')).toBeVisible(); // balance
    expect(screen.getByText('Mano de obra de la reparación')).toBeVisible();
    expect(screen.getByText('Materiales varios')).toBeVisible();
    // Both lines belong to the same job: the label renders per line.
    expect(screen.getAllByText('Trabajo: Visita técnica')).toHaveLength(2);
    // Recorded payment: shown in the «Pagado» row and the payments section.
    expect(screen.getAllByText('USD 50.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeVisible();
  });

  it('hides payments that are not `recorded` (D6: they do not count)', async () => {
    serveInvoice({
      detail: invoiceDetail({
        // The server only counts `recorded` payments: paidNet/balance follow.
        paidNet: '0.00',
        balance: '121.00',
        payments: [
          {
            id: 'pay-dup',
            kind: 'charge',
            status: 'duplicate_suspect',
            amount: '50.00',
            paidAt: '2026-10-13',
            method: null,
            reference: null,
            notes: null,
            duplicateOfId: 'pay-1',
            reconciledAt: null,
            registeredByCompanyId: 'c-1',
            createdAt: '2026-10-13T10:00:00.000Z',
          },
        ],
      }),
    });
    renderInvoice();

    await screen.findByRole('heading', { name: /Factura N.º 7/ });
    expect(screen.queryByText('USD 50.00')).not.toBeInTheDocument();
  });

  it('shows the 404 status with the back link (AC-F3.11)', async () => {
    serveInvoice({ error: problemJson(404, 'Factura no encontrada.') });
    renderInvoice();

    expect(await screen.findByText('Factura no encontrada.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a mis facturas' })).toBeVisible();
  });
});
