import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';

import { useMe } from '@/auth/session';

import { BottomNav } from './bottom-nav';
import { CompanySwitcher } from './company-switcher';
import { LogoutButton } from './logout-button';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

/**
 * Authenticated shell: sidebar ≥768 (full at 1280), bottom nav below 768, top
 * bar with the space switcher, theme toggle and logout (spec F0 §7 / §10).
 */
export function AppShell() {
  const { t } = useTranslation(['common', 'auth']);
  const { data: me } = useMe();

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {t('common:app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-4">
          <div className="flex min-w-0 flex-1 items-center">
            <CompanySwitcher />
          </div>
          {me ? (
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">
              {me.email}
            </span>
          ) : null}
          <ThemeToggle />
          <LogoutButton />
        </header>
        <main id="main-content" className="min-w-0 flex-1 p-4 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
