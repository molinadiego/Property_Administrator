import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';

import { RequireActiveCompany, RequireGuest, RequireSession } from '@/auth/guards';
import { AppShell } from '@/layout/app-shell';
import { ComingSoonStage } from '@/pages/coming-soon-stage';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RootRoute } from '@/pages/root-route';

/**
 * Route table (spec F0 §7):
 * - `/login`: guest only; with a session it redirects to the active space;
 * - `/`: space picker / no-spaces screen / auto-redirect with a single space;
 * - `/app/*`: authenticated shell with a placeholder per section (F0-D6).
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
      { index: true, element: <ComingSoonStage labelKey="dashboard" stage="F2" /> },
      { path: 'orders', element: <ComingSoonStage labelKey="orders" stage="F4" /> },
      { path: 'catalogs', element: <ComingSoonStage labelKey="catalogs" stage="F3" /> },
      { path: 'billing', element: <ComingSoonStage labelKey="billing" stage="F7" /> },
      { path: 'settings', element: <ComingSoonStage labelKey="settings" stage="F8" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function createAppRouter(initialEntries?: string[]) {
  return initialEntries
    ? createMemoryRouter(appRoutes, { initialEntries })
    : createBrowserRouter(appRoutes);
}
