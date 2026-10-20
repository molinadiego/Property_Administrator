import { render } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { createQueryClient } from '@/api/query-client';
import { AppProviders } from '@/app/providers';
import { appRoutes } from '@/app/router';

/** Renders the real route table inside a memory router with a fresh cache. */
export function renderApp(initialEntries: string[] = ['/']) {
  const queryClient: QueryClient = createQueryClient();
  const router = createMemoryRouter(appRoutes, { initialEntries });
  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { queryClient, router, ...view };
}

export function currentPath(router: ReturnType<typeof createMemoryRouter>): string {
  const location = router.state.location;
  return location.pathname + location.search;
}
