import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { MeResponseDto, NotificationListViewDto, OrderViewDto } from '@/api/types';
import { storageKeys } from '@/lib/storage';
import { ME_MEMBER_ONE_SPACE, ME_TWO_SPACES } from '@/test/fixtures';
import { apiCalls, jsonResponse, problemJson, setFetchHandler } from '@/test/fetch-stub';
import { renderApp } from '@/test/render-app';

// ---------------------------------------------------------------------------
// Fixtures (spec F2 §8): shapes mirror the generated client DTOs.
// ---------------------------------------------------------------------------

const orderFixture = (over: Partial<OrderViewDto>): OrderViewDto => ({
  id: 'o-1',
  title: 'Orden demo',
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
  createdAt: '2026-10-10T08:00:00.000Z',
  ...over,
});

const jobFixture = (
  id: string,
  title: string,
  assignments: OrderViewDto['jobs'][number]['assignments'],
): OrderViewDto['jobs'][number] => ({
  id,
  title,
  description: 'Trabajo',
  sortOrder: 0,
  status: 'pending',
  startedAt: null,
  completedAt: null,
  assignments,
});

const assignmentFixture = (
  id: string,
  assigneeMembershipId: string,
  over?: Partial<OrderViewDto['jobs'][number]['assignments'][number]>,
): OrderViewDto['jobs'][number]['assignments'][number] => ({
  id,
  status: 'pending',
  assigneeMembershipId,
  respondedAt: null,
  rejectionReason: null,
  createdAt: '2026-10-11T09:00:00.000Z',
  ...over,
});

const notifFixture = (
  over: Partial<NotificationListViewDto['data'][number]>,
): NotificationListViewDto['data'][number] => ({
  id: 'n-1',
  type: 'assignment_requested',
  title: 'Te asignaron un trabajo',
  body: 'Revisa la orden.',
  entityType: 'assignment',
  entityId: 'a-1',
  link: null,
  readAt: null,
  createdAt: '2026-10-12T10:00:00.000Z',
  companyId: 'c-1',
  ...over,
});

const isMe = (call: { url: string }) => call.url.endsWith('/auth/me');
const isOrders = (call: { url: string; method: string }) =>
  call.url.includes('/companies/c-1/orders') && call.method === 'GET';
const isOpenOrders = (call: { url: string; method: string }) =>
  isOrders(call) && call.url.includes('status=open');
const isPendingOrders = (call: { url: string; method: string }) =>
  isOrders(call) && call.url.includes('assignment_status=pending');
const isNotifications = (call: { url: string; method: string }) =>
  call.url.includes('/notifications') && call.method === 'GET';

interface ServeOptions {
  me?: MeResponseDto;
  openOrders?: OrderViewDto[];
  pendingOrders?: OrderViewDto[];
  notifications?: NotificationListViewDto[];
  accept?: Response;
  reject?: Response;
  markRead?: Response;
  /** Pending list answers once with rows, then this (for refetch flows). */
  pendingAfter?: OrderViewDto[];
  /** Notifications pages answer in sequence (cursor flow). */
  notificationsAfter?: NotificationListViewDto[];
}

/** Active space `c-1`; each card answers per test (spec F2 §8). */
function serveDashboard(options: ServeOptions = {}) {
  let pendingCalls = 0;
  let notifCalls = 0;
  setFetchHandler((call) => {
    if (isMe(call)) return jsonResponse(200, options.me ?? ME_TWO_SPACES);
    if (isPendingOrders(call)) {
      pendingCalls += 1;
      const pages =
        pendingCalls > 1 && options.pendingAfter ? options.pendingAfter : options.pendingOrders;
      return jsonResponse(200, pages ?? []);
    }
    if (isOpenOrders(call)) return jsonResponse(200, options.openOrders ?? []);
    if (isNotifications(call)) {
      notifCalls += 1;
      const pages = options.notifications ?? [];
      if (call.url.includes('cursor=')) {
        // Follow the cursor across the provided pages (page 1 carries `cur-1`).
        const pageIndex = call.url.includes('cursor=cur-1') ? 1 : 0;
        return jsonResponse(200, pages[pageIndex] ?? { data: [], nextCursor: null });
      }
      const page =
        notifCalls > 1 && options.notificationsAfter
          ? options.notificationsAfter[notifCalls - 2] ?? pages[0]
          : pages[0];
      return jsonResponse(200, page ?? { data: [], nextCursor: null });
    }
    if (call.url.includes('/assignments/a-1/accept') && call.method === 'POST') {
      return options.accept ?? jsonResponse(204);
    }
    if (call.url.includes('/assignments/a-1/reject') && call.method === 'POST') {
      return options.reject ?? jsonResponse(204);
    }
    if (call.url.includes('/notifications/') && call.url.endsWith('/read') && call.method === 'POST') {
      return options.markRead ?? jsonResponse(204);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  });
}

function renderDashboard() {
  window.localStorage.setItem(storageKeys.activeCompany, 'c-1');
  return renderApp(['/app']);
}

const pendingOrder = (over?: Partial<OrderViewDto>) =>
  orderFixture({
    id: 'o-p',
    title: 'Orden con trabajo pendiente',
    jobs: [jobFixture('j-1', 'Visita técnica', [assignmentFixture('a-1', 'mem-ana-c1')])],
    ...over,
  });

// ---------------------------------------------------------------------------
// Dashboard (spec F2, AC-F2.1 … AC-F2.12)
// ---------------------------------------------------------------------------

describe('dashboard screen (spec F2)', () => {
  it('shows the active space name and its participant type (AC-F2.1)', async () => {
    serveDashboard();
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();
    expect(screen.getByText('Administradora de propiedades')).toBeVisible();
  });

  it('maps the 4 companyType values to the 3 participant texts (AC-F2.1, F1-D2)', async () => {
    const cases = [
      { companyType: 'property_management', text: 'Administradora de propiedades' },
      { companyType: 'contractor', text: 'Contratista' },
      { companyType: 'own_business', text: 'Profesional independiente' },
      { companyType: 'profesional', text: 'Profesional independiente' },
    ] as const;
    for (const { companyType, text } of cases) {
      cleanup();
      const me: MeResponseDto = {
        ...ME_TWO_SPACES,
        memberships: [{ ...ME_TWO_SPACES.memberships[0], companyType }],
      };
      serveDashboard({ me });
      renderDashboard();

      expect(await screen.findByText(text)).toBeVisible();
    }
  });

  it('lists open orders with BE-2 R5 labels and the urgent mark (AC-F2.2)', async () => {
    serveDashboard({
      openOrders: [
        orderFixture({ id: 'o-1', title: 'Orden enviada', status: 'open', urgent: true }),
        orderFixture({ id: 'o-2', title: 'Orden en curso', status: 'in_progress' }),
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Orden enviada')).toBeVisible();
    expect(screen.getByText('Orden en curso')).toBeVisible();
    expect(screen.getByText('Enviada')).toBeVisible();
    expect(screen.getByText('En curso')).toBeVisible();
    expect(screen.getByText('Urgente')).toBeVisible();
  });

  it('shows the empty state of open orders (AC-F2.2)', async () => {
    serveDashboard({ openOrders: [] });
    renderDashboard();

    expect(await screen.findByText('No hay órdenes abiertas.')).toBeVisible();
  });

  it('recovers a failed card with its own retry (AC-F2.10)', async () => {
    let openFailed = true;
    setFetchHandler((call) => {
      if (isMe(call)) return jsonResponse(200, ME_TWO_SPACES);
      if (isOpenOrders(call)) {
        if (openFailed) return problemJson(500, 'Fallo interno.');
        return jsonResponse(200, [orderFixture({ title: 'Recuperada' })]);
      }
      if (isPendingOrders(call)) return jsonResponse(200, []);
      if (isNotifications(call)) return jsonResponse(200, { data: [], nextCursor: null });
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText('Fallo interno.', {}, { timeout: 5000 })).toBeVisible();
    // The other cards still work.
    expect(screen.getByText('No tienes asignaciones pendientes de respuesta.')).toBeVisible();

    openFailed = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Recuperada')).toBeVisible();
  });

  it('never renders orders of other spaces, even assigned to me (§2.4, flow 4)', async () => {
    // The server list carries cross-space assignments (§2.12 visibility); the
    // portada of the active space (c-1) must not render them (spec F2 §8).
    serveDashboard({
      openOrders: [
        orderFixture({ id: 'o-g', title: 'Orden propia' }),
        orderFixture({ id: 'o-t', title: 'Orden de otro espacio', companyId: 'c-2' }),
      ],
      pendingOrders: [
        orderFixture({
          id: 'o-p-g',
          title: 'Pendiente propia',
          jobs: [jobFixture('j-1', 'Trabajo propio', [assignmentFixture('a-1', 'mem-ana-c1')])],
        }),
        orderFixture({
          id: 'o-p-t',
          title: 'Pendiente de otro espacio',
          companyId: 'c-2',
          jobs: [
            jobFixture('j-2', 'Trabajo ajeno', [assignmentFixture('a-2', 'mem-ana-c1')]),
          ],
        }),
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Orden propia', { exact: true })).toBeVisible();
    expect(screen.queryByText('Orden de otro espacio')).toBeNull();
    expect(screen.getByText('Pendiente propia', { exact: true })).toBeVisible();
    expect(screen.queryByText('Pendiente de otro espacio')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Aceptar: / })).toHaveLength(1);
  });

  it('renders one action row per own pending assignment only (AC-F2.3)', async () => {
    serveDashboard({
      pendingOrders: [
        orderFixture({
          id: 'o-p',
          title: 'Orden con trabajo pendiente',
          jobs: [
            jobFixture('j-1', 'Visita técnica', [
              assignmentFixture('a-1', 'mem-ana-c1'),
              assignmentFixture('a-2', 'mem-otro'),
            ]),
          ],
        }),
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Trabajo: Visita técnica')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aceptar: Orden con trabajo pendiente' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rechazar: Orden con trabajo pendiente' })).toBeVisible();
    // Only one row: the assignment of the other member has no actions (§20.3).
    expect(screen.getAllByRole('button', { name: /Aceptar: / })).toHaveLength(1);
  });

  it('accepts through the confirmation dialog and refreshes the list (AC-F2.4)', async () => {
    serveDashboard({
      pendingOrders: [pendingOrder()],
      pendingAfter: [],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: 'Aceptar: Orden con trabajo pendiente' }),
    );
    const acceptDialog = await screen.findByRole('dialog');
    expect(within(acceptDialog).getByText(/Visita técnica/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Aceptar trabajo' }));

    const accept = apiCalls(
      (call) => call.method === 'POST' && call.url.includes('/assignments/a-1/accept'),
    )[0];
    expect(accept).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Aceptar: / })).toBeNull(),
    );
  });

  it('rejects with the optional reason in the body (AC-F2.5)', async () => {
    serveDashboard({
      pendingOrders: [pendingOrder()],
      pendingAfter: [],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: 'Rechazar: Orden con trabajo pendiente' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('El trabajo queda libre para una nueva asignación.')).toBeVisible();

    await user.type(within(dialog).getByRole('textbox'), 'No puedo esa fecha.');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar trabajo' }));

    const reject = apiCalls(
      (call) => call.method === 'POST' && call.url.includes('/assignments/a-1/reject'),
    )[0];
    expect(reject.body).toEqual({ reason: 'No puedo esa fecha.' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Rechazar: / })).toBeNull(),
    );
  });

  it('sends the rejection without reason when the textarea stays empty (F2 §6)', async () => {
    serveDashboard({
      pendingOrders: [pendingOrder()],
      pendingAfter: [],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: 'Rechazar: Orden con trabajo pendiente' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar trabajo' }));

    const reject = apiCalls(
      (call) => call.method === 'POST' && call.url.includes('/assignments/a-1/reject'),
    )[0];
    expect(reject.body).toEqual({});
  });

  it('surfaces the RFC 7807 detail when the server answers 409 (AC-F2.6)', async () => {
    serveDashboard({
      pendingOrders: [pendingOrder()],
      reject: problemJson(409, 'La asignación ya fue respondida.'),
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: 'Rechazar: Orden con trabajo pendiente' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar trabajo' }));

    expect(await screen.findByText('La asignación ya fue respondida.')).toBeVisible();
  });

  it('renders only the active space notifications and counts them for the badge (AC-F2.7)', async () => {
    serveDashboard({
      notifications: [
        {
          data: [
            notifFixture({ id: 'n-1', title: 'Notificación de Gestión Demo', companyId: 'c-1' }),
            notifFixture({
              id: 'n-2',
              title: 'Notificación de Taller Carla',
              companyId: 'c-2',
              readAt: '2026-10-12T11:00:00.000Z',
            }),
            notifFixture({ id: 'n-3', title: 'Segunda de Gestión Demo', companyId: 'c-1' }),
          ],
          nextCursor: null,
        },
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Notificación de Gestión Demo')).toBeVisible();
    expect(screen.getByText('Segunda de Gestión Demo')).toBeVisible();
    // §2.4: the other space's notification never renders nor counts.
    expect(screen.queryByText('Notificación de Taller Carla')).toBeNull();
    expect(screen.getByText('2')).toBeVisible(); // 2 unread of c-1
    expect(screen.getByText('2 notificaciones sin leer')).toBeInTheDocument();
  });

  it('marks a notification as read and the badge drops (AC-F2.8)', async () => {
    serveDashboard({
      notifications: [
        {
          data: [notifFixture({ id: 'n-1', title: 'Primer aviso' })],
          nextCursor: null,
        },
      ],
      notificationsAfter: [
        {
          data: [
            notifFixture({
              id: 'n-1',
              title: 'Primer aviso',
              readAt: '2026-10-12T12:00:00.000Z',
            }),
          ],
          nextCursor: null,
        },
      ],
    });
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText('1 notificación sin leer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar como leída: Primer aviso' }));

    expect(await screen.findByText('Leída')).toBeVisible();
    expect(screen.queryByText('1 notificación sin leer')).toBeNull();
    const read = apiCalls(
      (call) => call.method === 'POST' && call.url.includes('/notifications/n-1/read'),
    )[0];
    expect(read).toBeDefined();
  });

  it('loads the next notification page through the cursor', async () => {
    serveDashboard({
      notifications: [
        { data: [notifFixture({ id: 'n-1' })], nextCursor: 'cur-1' },
        { data: [notifFixture({ id: 'n-2', title: 'Segunda página' })], nextCursor: null },
      ],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('Segunda página')).toBeVisible();
    expect(apiCalls(isNotifications).some((call) => call.url.includes('cursor=cur-1'))).toBe(true);
  });

  it('offers the Miembros shortcut to owners only (AC-F2.9)', async () => {
    serveDashboard();
    renderDashboard();

    const shortcuts = await screen.findByRole('navigation', { name: 'Accesos rápidos' });
    expect(within(shortcuts).getByRole('link', { name: 'Miembros' })).toBeVisible();
    expect(within(shortcuts).getByRole('link', { name: 'Órdenes' })).toBeVisible();

    cleanup();
    serveDashboard({ me: ME_MEMBER_ONE_SPACE });
    renderDashboard();

    const memberShortcuts = await screen.findByRole('navigation', { name: 'Accesos rápidos' });
    expect(within(memberShortcuts).queryByRole('link', { name: 'Miembros' })).toBeNull();
    expect(within(memberShortcuts).getByRole('link', { name: 'Órdenes' })).toBeVisible();
  });
});
