import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  HistoryFileViewDto,
  HistoryJobViewDto,
  PropertyHistoryViewDto,
  PropertyShareViewDto,
} from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_TWO_SPACES, MEMBERS_GESTION, PROPERTY_P1 } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { currentPath, renderApp } from '@/test/render-app';

// ---------------------------------------------------------------------------
// Property history (spec F5 §2.4/§5, AC-F5.5…AC-F5.9, AC-F5.14; F5-D2 scope).
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

const historyFile = (over: Partial<HistoryFileViewDto> = {}): HistoryFileViewDto => ({
  id: 'f-1',
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

const shareFixture = (over: Partial<PropertyShareViewDto> = {}): PropertyShareViewDto => ({
  id: 's-1',
  sharedWithMembershipId: 'm-bob',
  note: 'Acceso acordado con el contratista.',
  createdAt: '2026-10-10T10:00:00.000Z',
  ...over,
});

const historyFixture = (over: Partial<PropertyHistoryViewDto> = {}): PropertyHistoryViewDto => ({
  property: { id: 'p-1', addressLine: 'Calle Falsa 123', city: 'Springfield', state: 'IL' },
  scope: 'full',
  orders: [
    {
      id: 'o-1',
      title: 'Reparar triturador',
      status: 'completed',
      createdAt: '2026-10-01T10:00:00.000Z',
      closedAt: '2026-10-05T10:00:00.000Z',
      parentOrderId: null,
      jobs: [historyJob()],
      files: [historyFile()],
    },
  ],
  shares: [],
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isMembers = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/members');
const isPropertyHistory = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/history/properties/p-1');
const isShareList = (call: { url: string }) => call.url.includes('/companies/c-1/history');
const isFile = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/files/');
const isProperties = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/companies/c-1/properties');
const isManaged = (call: { url: string; method: string }) =>
  call.method === 'GET' && call.url.includes('/history/orders');

interface ServeHistoryOptions {
  history?: Response;
  shares?: PropertyShareViewDto[];
  file?: Response;
  createShare?: Response;
  revoke?: Response;
}

/**
 * Active space `c-1`; the property history + members + share mutations answer
 * per test. `shares` is mutable so a revoke can be observed on the refetch.
 */
function serveProperty(options: ServeHistoryOptions = {}) {
  const shares = options.shares ?? [];
  const history = options.history;
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
    if (call.method === 'POST' && call.url.includes('/history/shares')) {
      return options.createShare ?? jsonResponse(201, {});
    }
    if (call.method === 'DELETE' && call.url.includes('/history/shares/')) {
      shares.splice(0, shares.length);
      return options.revoke ?? jsonResponse(204);
    }
    if (isPropertyHistory(call)) {
      if (history) return history;
      return jsonResponse(200, historyFixture({ shares: [...shares] }));
    }
    if (isMembers(call)) return jsonResponse(200, MEMBERS_GESTION);
    if (isFile(call)) return options.file ?? problemJson(404, 'Archivo no encontrado.');
    if (isProperties(call)) return jsonResponse(200, [PROPERTY_P1]);
    // Navigation to the hub from the 404 screen keeps answering.
    if (isManaged(call)) return jsonResponse(200, { data: [] });
    if (isShareList(call)) return jsonResponse(200, {});
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderPropertyHistory(propertyId = 'p-1') {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp([`/app/history/properties/${propertyId}`]);
}

describe('property history (spec F5 §2.4/§5, AC-F5.5…AC-F5.9)', () => {
  it('renders the owner mode, the files and never a delete action (AC-F5.6)', async () => {
    serveProperty();
    renderPropertyHistory();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Calle Falsa 123' }),
    ).toBeVisible();
    expect(screen.getByText('Historial completo')).toBeVisible();
    expect(screen.getByText('Springfield, IL')).toBeVisible();

    // Owner links to the order detail (scope full, F5-D4).
    const title = screen.getByRole('link', { name: 'Reparar triturador' });
    expect(title).toHaveAttribute('href', '/app/orders/o-1');
    expect(screen.getByText(/Creada el .*Cerrada el/)).toBeVisible();

    // §7.5 management section is visible for the owner with its share action.
    expect(screen.getByRole('heading', { level: 2, name: 'Antecedentes compartidos' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Compartir historial' })).toBeVisible();
    expect(screen.getByText('Sin antecedentes compartidos.')).toBeVisible();

    // Visible file with size + download (F5-D5); retired rows are covered by
    // the order-detail test (AC-F5.11).
    expect(screen.getByRole('heading', { level: 4, name: 'Archivos' })).toBeVisible();
    expect(screen.getByText('fachada.jpg')).toBeVisible();
    expect(screen.getByText('2.0 KB')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Descargar fachada.jpg' })).toBeVisible();

    // AC-F5.6: no delete UI anywhere and no DELETE request on a plain load.
    expect(screen.queryByRole('button', { name: /borrar|eliminar|quitar/i })).toBeNull();
    expect(apiCalls((call) => call.method === 'DELETE')).toHaveLength(0);
  });

  it('hides the share section and the order links for scope shared (F5-D2)', async () => {
    serveProperty({ history: jsonResponse(200, historyFixture({ scope: 'shared' })) });
    renderPropertyHistory();

    expect(await screen.findByText('Compartido contigo')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Antecedentes compartidos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Compartir historial' })).toBeNull();
    // Their order detail would 404 for this scope (AC-F5.13).
    expect(screen.queryByRole('link', { name: 'Reparar triturador' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Reparar triturador' })).toBeVisible();
  });

  it('labels scope own_jobs as «Solo tus trabajos» (F5-D2)', async () => {
    serveProperty({ history: jsonResponse(200, historyFixture({ scope: 'own_jobs' })) });
    renderPropertyHistory();

    expect(await screen.findByText('Solo tus trabajos')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Compartir historial' })).toBeNull();
  });

  it('shows the «sin acceso» screen on 404 without leaking existence (AC-F5.9)', async () => {
    serveProperty({ history: problemJson(404, 'Propiedad no encontrada.') });
    const user = userEvent.setup();
    const { router } = renderPropertyHistory();

    expect(await screen.findByRole('heading', { name: 'Historial no disponible' })).toBeVisible();
    expect(
      screen.getByText('Esta dirección no existe o no tienes acceso a su historial.'),
    ).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Volver al historial' }));
    await waitFor(() => expect(currentPath(router)).toBe('/app/history'));
  });

  it('shares with a validated member, excluding the already shared ones', async () => {
    serveProperty({ shares: [shareFixture()] });
    const user = userEvent.setup();
    renderPropertyHistory();

    await user.click(await screen.findByRole('button', { name: 'Compartir historial' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compartir historial' });

    // Validation before any network call (AC-F5.7).
    await user.click(within(dialog).getByRole('button', { name: 'Compartir' }));
    expect(await within(dialog).findByText('Selecciona una membresía.')).toBeVisible();
    expect(apiCalls((call) => call.method === 'POST')).toHaveLength(0);

    // Options: own members + my memberships elsewhere, minus m-bob (shared).
    await user.click(within(dialog).getByRole('combobox', { name: 'Membresía' }));
    expect(await screen.findByRole('option', { name: 'Ana Demo' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Taller Carla' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Bob Contratista' })).toBeNull();

    await user.click(screen.getByRole('option', { name: 'Ana Demo' }));
    await user.type(within(dialog).getByLabelText('Motivo (opcional)'), 'Antecedentes del sitio.');
    await user.click(within(dialog).getByRole('button', { name: 'Compartir' }));

    await waitFor(() => {
      const posts = apiCalls(
        (call) => call.method === 'POST' && call.url.includes('/history/shares'),
      );
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toEqual({
        propertyId: 'p-1',
        sharedWithMembershipId: 'm-ana',
        note: 'Antecedentes del sitio.',
      });
    });
    // Success closes the dialog (the refetch shows the new row).
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lists the active shares with label + note and revokes through confirmation (AC-F5.8)', async () => {
    serveProperty({ shares: [shareFixture()] });
    const user = userEvent.setup();
    renderPropertyHistory();

    // Row resolves the member label from the members list (§7.5).
    expect(await screen.findByText('Bob Contratista')).toBeVisible();
    expect(screen.getByText('Acceso acordado con el contratista.')).toBeVisible();
    expect(screen.getByText(/Compartido el/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revocar acceso' });
    expect(within(dialog).getByText(/Bob Contratista/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Revocar' }));

    await waitFor(() => {
      const deletes = apiCalls(
        (call) => call.method === 'DELETE' && call.url.includes('/history/shares/s-1'),
      );
      expect(deletes).toHaveLength(1);
    });
    // The invalidated refetch drops the row (server no longer lists it).
    await waitFor(() => expect(screen.queryByText('Bob Contratista')).toBeNull());
  });

  it('shows the no-access download banner on 404 without file data (AC-F5.5)', async () => {
    serveProperty({ file: problemJson(404, 'Archivo no encontrado o sin acceso.') });
    const user = userEvent.setup();
    renderPropertyHistory();

    await user.click(await screen.findByRole('button', { name: 'Descargar fachada.jpg' }));

    expect(
      await screen.findByText('No tienes acceso a descargar este archivo.'),
    ).toBeVisible();
    // The banner never echoes file data beyond its already-visible row.
    expect(screen.queryByText(/blob:/)).toBeNull();
  });
});
