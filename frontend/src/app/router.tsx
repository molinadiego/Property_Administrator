import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  type RouteObject,
} from 'react-router';

import { RequireActiveCompany, RequireGuest, RequireSession } from '@/auth/guards';
import { AppShell } from '@/layout/app-shell';
import { ComingSoonStage } from '@/pages/coming-soon-stage';
import { DashboardPage } from '@/pages/dashboard-page';
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
import { InvitationPage } from '@/pages/invitation-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RegisterPage } from '@/pages/register-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { RootRoute } from '@/pages/root-route';
import { MembersPage } from '@/pages/settings/members-page';

/**
 * Route table (specs F0 §7, F1 §2 / F1-D6):
 * - `/login`, `/register`, `/forgot-password`, `/reset-password`: guest only;
 *   with a session they redirect to the active space;
 * - `/invitations/:token`: public — works with or without a session;
 * - `/`: space picker / no-spaces screen (with space creation, F1) /
 *   auto-redirect with a single space;
 * - `/app/*`: authenticated shell; the index route is the F2 dashboard, Ajustes
 *   opens on its first real panel, Miembros (F1-D7); the rest keeps the F0-D6
 *   placeholders.
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
      { path: 'orders', element: <ComingSoonStage labelKey="orders" stage="F4" /> },
      { path: 'catalogs', element: <ComingSoonStage labelKey="catalogs" stage="F3" /> },
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
