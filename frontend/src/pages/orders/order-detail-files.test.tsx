import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FileViewDto, OrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, MEMBERS_GESTION, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

// ---------------------------------------------------------------------------
// Files inside the order detail (spec F5 §2.5/§6, AC-F5.10…AC-F5.12,
// AC-F5.15; F5-D5 grouping, F5-D6 kind inference, F5-D7 banners).
// ---------------------------------------------------------------------------

const assignment = (
  id: string,
  assigneeMembershipId: string,
  status: OrderViewDto['jobs'][number]['assignments'][number]['status'],
): OrderViewDto['jobs'][number]['assignments'][number] => ({
  id,
  status,
  assigneeMembershipId,
  respondedAt: null,
  rejectionReason: null,
  createdAt: '2026-10-11T09:00:00.000Z',
});

const job = (
  id: string,
  status: OrderViewDto['jobs'][number]['status'],
  assignments: OrderViewDto['jobs'][number]['assignments'],
): OrderViewDto['jobs'][number] => ({
  id,
  title: `Trabajo ${id}`,
  description: 'Trabajo demo',
  sortOrder: 1,
  status,
  startedAt: null,
  completedAt: null,
  assignments,
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
  jobs: [job('j-1', 'pending', [assignment('a-1', 'm-bob', 'accepted')])],
  createdAt: '2026-10-12T10:00:00.000Z',
  ...over,
});

const fileFixture = (over: Partial<FileViewDto> = {}): FileViewDto => ({
  id: 'f-1',
  orderId: 'o-1',
  targetType: 'order',
  targetId: 'o-1',
  kind: 'photo',
  filename: 'fachada.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 2048,
  createdAt: '2026-10-12T10:00:00.000Z',
  deletedAt: null,
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isDetail = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.endsWith('/orders/o-1');
const isMembers = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/members');
const isProperties = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');
const isOrderFiles = (call: { url: string; method: string }) =>
  call.url.includes('/companies/c-1/orders/o-1/files') && call.method === 'GET';
const isJobFiles = (call: { url: string; method: string }) =>
  call.url.includes('/companies/c-1/jobs/j-1/files') && call.method === 'POST';

interface ServeFilesOptions {
  files?: FileViewDto[];
  upload?: Response;
}

/** Active space `c-1`; the file list is mutable so uploads show up on refetch. */
function serveFiles(
  order: OrderViewDto,
  options: ServeFilesOptions = {},
) {
  const files = options.files ?? [
    fileFixture(),
    fileFixture({
      id: 'f-2',
      targetType: 'job',
      targetId: 'j-1',
      kind: 'document',
      filename: 'trabajo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    }),
  ];
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isDetail(call)) return jsonResponse(200, order);
    if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
    if (isProperties(call)) return jsonResponse(200, [PROPERTY_P1]);
    if (isOrderFiles(call)) return jsonResponse(200, { data: [...files] });
    if (isJobFiles(call)) return jsonResponse(201, fileFixture({ id: 'f-9', filename: 'evidencia.png' }));
    if (call.method === 'POST' && call.url.includes('/orders/o-1/files')) {
      const created = fileFixture({
        id: 'f-3',
        filename: 'acta.pdf',
        kind: 'document',
        contentType: 'application/pdf',
        sizeBytes: 10240,
      });
      files.push(created);
      return options.upload ?? jsonResponse(201, created);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderDetail() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app/orders/o-1']);
}

describe('order detail files (spec F5 §2.5/§6, AC-F5.10…AC-F5.12, AC-F5.15)', () => {
  it('groups the order-level card and the per-job evidence (F5-D5, AC-F5.10)', async () => {
    serveFiles(orderFixture());
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    expect(await within(filesCard).findByText('fachada.jpg')).toBeVisible();
    expect(within(filesCard).queryByText('trabajo.jpg')).toBeNull();

    const evidence = await screen.findByRole('region', { name: 'Evidencias' });
    expect(await within(evidence).findByText('trabajo.jpg')).toBeVisible();
    expect(within(evidence).queryByText('fachada.jpg')).toBeNull();
    // The visible control is the label; the real control is its hidden input.
    expect(within(filesCard).getByLabelText('Subir archivo')).toBeInTheDocument();
  });

  it('uploads an order file as multipart with the inferred kind (F5-D6)', async () => {
    serveFiles(orderFixture());
    const user = userEvent.setup();
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    const input = within(filesCard).getByLabelText('Subir archivo') as HTMLInputElement;
    await user.upload(input, new File(['hola'], 'acta.pdf', { type: 'application/pdf' }));

    await waitFor(() => {
      const posts = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/orders/o-1/files'),
      );
      expect(posts).toHaveLength(1);
      // FormData rides as multipart: only `kind` is a documented field (F5 §4).
      expect(String(posts[0].body)).toContain('name="kind"');
      expect(String(posts[0].body)).toContain('document');
    });
    // The settled mutation invalidates the list → the new file renders (§5).
    expect(await within(filesCard).findByText('acta.pdf')).toBeVisible();
  });

  it('rejects a non-allowlisted type locally without any request (AC-F5.16)', async () => {
    serveFiles(orderFixture());
    // `applyAccept: false` simulates a picker that ignored `accept`: the local
    // mirror must still reject the type before any request (AC-F5.16).
    const user = userEvent.setup({ applyAccept: false });
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    const input = within(filesCard).getByLabelText('Subir archivo');
    // Mirrors the picker that ignored `accept` (the type check runs first).
    await user.upload(
      input,
      new File(['echo'], 'payload.sh', { type: 'application/x-sh' }),
    );

    expect(await within(filesCard).findByText('Tipo de archivo no permitido.')).toBeVisible();
    expect(apiCalls((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('rejects a file over 10 MB locally without any request', async () => {
    serveFiles(orderFixture());
    const user = userEvent.setup();
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    const input = within(filesCard).getByLabelText('Subir archivo');
    const huge = new File(['x'], 'panorama.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(input, huge);

    expect(await within(filesCard).findByText('El archivo supera el máximo de 10 MB.')).toBeVisible();
    expect(apiCalls((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('shows the RFC 7807 detail when the server refuses the upload (415)', async () => {
    serveFiles(orderFixture(), { upload: problemJson(415, 'Tipo fuera de allowlist.') });
    const user = userEvent.setup();
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    const input = within(filesCard).getByLabelText('Subir archivo');
    await user.upload(input, new File(['hola'], 'acta.pdf', { type: 'application/pdf' }));

    expect(await within(filesCard).findByText('Tipo fuera de allowlist.')).toBeVisible();
  });

  it('marks retired files without a download action (AC-F5.11)', async () => {
    serveFiles(
      orderFixture(),
      { files: [fileFixture({ deletedAt: '2026-10-13T10:00:00.000Z' })] },
    );
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    expect(within(filesCard).getByText('Retirado')).toBeVisible();
    expect(within(filesCard).queryByRole('button', { name: /Descargar/ })).toBeNull();
  });

  it('shows both empty states when the order has no files (AC-F5.4)', async () => {
    serveFiles(orderFixture(), { files: [] });
    renderDetail();

    const filesCard = await screen.findByRole('region', { name: 'Archivos' });
    expect(await within(filesCard).findByText('Sin archivos todavía.')).toBeVisible();
    const evidence = await screen.findByRole('region', { name: 'Evidencias' });
    expect(await within(evidence).findByText('Sin evidencias todavía.')).toBeVisible();
  });

  it('links the header address to the property history (AC-F5.15)', async () => {
    serveFiles(orderFixture());
    renderDetail();

    const address = await screen.findByRole('link', { name: 'Calle Falsa 123' });
    expect(address).toHaveAttribute('href', '/app/history/properties/p-1');
  });
});

