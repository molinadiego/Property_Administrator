import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { HistoryJobViewDto, JobHistoryEntryViewDto, ManagedOrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

// ---------------------------------------------------------------------------
// History hub (spec F5 §2.2/§2.3, AC-F5.1…AC-F5.4; F5-D4 links, F4-D2 join).
// ---------------------------------------------------------------------------

const historyJob = (over: Partial<HistoryJobViewDto> = {}): HistoryJobViewDto => ({
  id: 'j-1',
  title: 'Cambiar mezcladora',
  status: 'done',
  startedAt: '2026-10-02T09:00:00.000Z',
  completedAt: '2026-10-02T11:00:00.000Z',
  result: 'Mezcladora reemplazada',
  reason: null,
  ...over,
});

const managedOrder = (over: Partial<ManagedOrderViewDto> = {}): ManagedOrderViewDto => ({
  id: 'o-1',
  title: 'Reparar triturador',
  status: 'completed',
  createdAt: '2026-10-01T10:00:00.000Z',
  closedAt: '2026-10-05T10:00:00.000Z',
  property: { id: 'p-1', addressLine: 'Calle Falsa 123', city: 'Springfield' },
  jobs: [historyJob()],
  ...over,
});

const mineEntry = (over: Partial<JobHistoryEntryViewDto> = {}): JobHistoryEntryViewDto => ({
  id: 'j-1',
  title: 'Cambiar mezcladora',
  status: 'done',
  startedAt: '2026-10-02T09:00:00.000Z',
  completedAt: '2026-10-02T11:00:00.000Z',
  result: 'Mezcladora reemplazada',
  reason: null,
  assignmentStatus: 'accepted',
  order: { id: 'o-1', title: 'Reparar triturador', status: 'completed' },
  property: { id: 'p-1', addressLine: 'Calle Falsa 123', city: 'Springfield' },
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isManaged = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/history/orders');
const isMine = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/me/job-history');
const isProperties = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');

interface ServeHistoryOptions {
  managed?: ManagedOrderViewDto[];
  mine?: JobHistoryEntryViewDto[];
}

/** Active space `c-1`; both tabs + the F4-D2 properties join answer per test. */
function serveHistory(options: ServeHistoryOptions = {}) {
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (isManaged(call)) return jsonResponse(200, { data: options.managed ?? [] });
    if (isMine(call)) return jsonResponse(200, { data: options.mine ?? [] });
    if (isProperties(call)) return jsonResponse(200, [PROPERTY_P1]);
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderHistory(search = '/app/history') {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp([search]);
}

describe('history hub (spec F5 §2.2, AC-F5.1…AC-F5.4)', () => {
  it('defaults to «Del espacio» with links only for own-space properties (F5-D4)', async () => {
    serveHistory({
      managed: [
        managedOrder(),
        managedOrder({
          id: 'o-2',
          title: 'Orden ajena',
          property: { id: 'p-foreign', addressLine: 'Av. Ajena 9', city: 'Shelbyville' },
          jobs: [],
        }),
      ],
    });
    renderHistory();

    // Default tab is marked with aria-current and renders the space view.
    const spaceTab = await screen.findByRole('link', { name: 'Del espacio' });
    expect(spaceTab).toHaveAttribute('aria-current', 'page');
    // Creation + closure dates of §7.3 on both managed rows (locale-independent).
    expect(await screen.findAllByText(/Creada el .*Cerrada el/)).toHaveLength(2);

    // Own property (p-1 ∈ F3 cache): order and address are links.
    const ownTitle = screen.getByRole('link', { name: 'Reparar triturador' });    expect(ownTitle).toHaveAttribute('href', '/app/orders/o-1');
    const ownAddress = screen.getByRole('link', { name: 'Calle Falsa 123 · Springfield' });
    expect(ownAddress).toHaveAttribute('href', '/app/history/properties/p-1');

    // Foreign property: same data, no links (their detail would 404, F5-D4).
    expect(screen.queryByRole('link', { name: 'Orden ajena' })).toBeNull();
    expect(screen.getByText('Av. Ajena 9 · Shelbyville')).toBeVisible();

    // Terminal job antecedents only (no free progress notes, §4.5).
    expect(screen.getByText('Mezcladora reemplazada')).toBeVisible();
  });

  it('switches to «Mis trabajos» with property links from F5-D3 (AC-F5.3)', async () => {
    serveHistory({ mine: [mineEntry()] });
    const user = userEvent.setup();
    const { router } = renderHistory();

    await screen.findByRole('link', { name: 'Del espacio' });
    await user.click(screen.getByRole('link', { name: 'Mis trabajos' }));

    await waitFor(() => expect(currentPath(router)).toContain('?tab=mine'));
    const mineTab = screen.getByRole('link', { name: 'Mis trabajos' });
    expect(mineTab).toHaveAttribute('aria-current', 'page');

    // F5-D3: the row links to the property history and keeps order + statuses.
    const address = await screen.findByRole('link', { name: 'Calle Falsa 123 · Springfield' });
    expect(address).toHaveAttribute('href', '/app/history/properties/p-1');
    expect(screen.getByText('Cambiar mezcladora')).toBeVisible();
    expect(screen.getByText('Orden: Reparar triturador')).toBeVisible();
    expect(screen.getByText('Completado')).toBeVisible();
    expect(screen.getByText('Aceptada')).toBeVisible();
    // The job itself is not a link (AC-F5.13 forbids links to foreign detail).
    expect(screen.queryByRole('link', { name: 'Cambiar mezcladora' })).toBeNull();
  });

  it('honours ?tab=mine on a cold load', async () => {
    serveHistory({ mine: [mineEntry()] });
    renderHistory('/app/history?tab=mine');

    const mineTab = await screen.findByRole('link', { name: 'Mis trabajos' });
    expect(mineTab).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Cambiar mezcladora')).toBeVisible();
  });

  it('shows the empty state of the space tab (AC-F5.4)', async () => {
    serveHistory({ managed: [] });
    renderHistory();

    expect(
      await screen.findByText('El espacio todavía no gestiona órdenes.'),
    ).toBeVisible();
    expect(apiCalls(isMine)).toHaveLength(0);
  });

  it('surfaces the RFC 7807 detail and retries the space tab on demand', async () => {
    // The query client retries 5xx once: both first attempts must fail so the
    // error state actually renders; the manual retry then succeeds.
    let attempts = 0;
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      if (isManaged(call)) {
        attempts += 1;
        return attempts <= 2
          ? problemJson(500, 'Fallo transitorio del servidor.')
          : jsonResponse(200, { data: [managedOrder()] });
      }
      if (isMine(call)) return jsonResponse(200, { data: [] });
      if (isProperties(call)) return jsonResponse(200, [PROPERTY_P1]);
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    renderHistory();

    // The query client retries 5xx once (1 s delay): let the banner settle
    // before asserting, then the manual retry must succeed.
    expect(
      await screen.findByText('Fallo transitorio del servidor.', {}, { timeout: 5000 }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('link', { name: 'Reparar triturador' })).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(3);
  });
});
