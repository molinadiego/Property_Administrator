import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  type RouteObject,
} from 'react-router';

import { RequireActiveCompany, RequireGuest, RequireSession } from '@/auth/guards';
import { AppShell } from '@/layout/app-shell';
import { ComingSoonStage } from '@/pages/coming-soon-stage';
import { CatalogsLayout } from '@/pages/catalogs/catalogs-layout';
import { ClientsPage } from '@/pages/catalogs/clients-page';
import { PropertiesPage } from '@/pages/catalogs/properties-page';
import { PropertyDetailPage } from '@/pages/catalogs/property-detail-page';
import { PropertyNewPage } from '@/pages/catalogs/property-new-page';
import { RelationsPage } from '@/pages/catalogs/relations-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
import { HistoryPage } from '@/pages/history/history-page';
import { PropertyHistoryPage } from '@/pages/history/property-history-page';
import { InvitationPage } from '@/pages/invitation-page';
import { LimitedInvoicePage } from '@/pages/limited/limited-invoice-page';
import { LimitedPortalPage } from '@/pages/limited/limited-portal-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { OrderDetailPage } from '@/pages/orders/order-detail-page';
import { OrderNewPage } from '@/pages/orders/order-new-page';
import { OrdersPage } from '@/pages/orders/orders-page';
import { RegisterPage } from '@/pages/register-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { RootRoute } from '@/pages/root-route';
import { MembersPage } from '@/pages/settings/members-page';

/**
 * Route table (specs F0 §7, F1 §2 / F1-D6):
 * - `/login`, `/register`, `/forgot-password`, `/reset-password`: guest only;
 *   with a session they redirect to the active space;
 * - `/invitations/:token`: public — works with or without a session;
 * - `/limited/:token`: public limited portal (spec F3-D5, §2.2) — never
 *   redirects to `/login`; a 401 renders the invalid-link screen;
 * - `/`: space picker / no-spaces screen (with space creation, F1) /
 *   auto-redirect with a single space;
 * - `/app/*`: authenticated shell; the index route is the F2 dashboard, Ajustes
 *   opens on its first real panel, Miembros (F1-D7), `/app/catalogs` on its
 *   first section, Propiedades (F3-D3), Órdenes + detalle (F4), Historial +
 *   historial de propiedad (F5); the rest keeps the F0-D6 placeholders.
 */
export const appRoutes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  {
    path: '/register',
    element: (
      <RequireGuest>
        <RegisterPage />
      </RequireGuest>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <RequireGuest>
        <ForgotPasswordPage />
      </RequireGuest>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <RequireGuest>
        <ResetPasswordPage />
      </RequireGuest>
    ),
  },
  {
    path: '/invitations/:token',
    element: <InvitationPage />,
  },
  {
    // Public portal: hermetic route — the app-level 401 handler redirects to
    // /login only for guards inside /app (F3 §9).
    path: '/limited/:token',
    element: <LimitedPortalPage />,
  },
  {
    path: '/limited/:token/invoices/:invoiceId',
    element: <LimitedInvoicePage />,
  },
  {
    path: '/',
    element: (
      <RequireSession>
        <RootRoute />
      </RequireSession>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireSession>
        <RequireActiveCompany>
          <AppShell />
        </RequireActiveCompany>
      </RequireSession>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/new', element: <OrderNewPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      {
        path: 'catalogs',
        element: <CatalogsLayout />,
        children: [
          { index: true, element: <Navigate to="/app/catalogs/properties" replace /> },
          { path: 'properties', element: <PropertiesPage /> },
          { path: 'properties/new', element: <PropertyNewPage /> },
          { path: 'properties/:propertyId', element: <PropertyDetailPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'relations', element: <RelationsPage /> },
        ],
      },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/properties/:propertyId', element: <PropertyHistoryPage /> },
      { path: 'billing', element: <ComingSoonStage labelKey="billing" stage="F7" /> },
      { path: 'settings', element: <Navigate to="/app/settings/members" replace /> },
      { path: 'settings/members', element: <MembersPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function createAppRouter(initialEntries?: string[]) {
  return initialEntries
    ? createMemoryRouter(appRoutes, { initialEntries })
    : createBrowserRouter(appRoutes);
}
