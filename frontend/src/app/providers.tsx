import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/api/query-client';
import i18n from '@/i18n';
import { ActiveCompanyProvider } from '@/companies/active-company';
import { ThemeProvider } from '@/theme/theme-provider';

const defaultQueryClient = createQueryClient();

export function AppProviders({
  children,
  queryClient = defaultQueryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
