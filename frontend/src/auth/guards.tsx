import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';

import { useActiveCompany } from '@/companies/active-company';
import { safeInternalPath } from '@/lib/internal-path';

import { useMe } from './session';

/** Splash shown while `GET /auth/me` resolves (spec F0 §6). */
export function BootSplash() {
  const { t } = useTranslation('common');
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="size-8 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{t('boot.loading')}</p>
      </div>
    </div>
  );
}

/** Non-401 `me` failure (e.g. network down): error screen with retry, not login. */
export function SessionErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['auth', 'common']);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t('auth:session.loadFailed')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth:session.loadFailedBody')}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('common:action.retry')}
        </button>
      </div>
    </div>
  );
}

/**
 * Redirects to /login when there is no session, remembering the requested
 * route so the user returns to it after logging in (AC-F0.1).
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, error, isPending, refetch } = useMe();

  if (isPending) return <BootSplash />;
  if (error) return <SessionErrorScreen onRetry={() => void refetch()} />;
  if (data === null) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <>{children}</>;
}

/**
 * For /login (and the other guest screens): an authenticated user is sent to
 * their active space (or to the picker when nothing is active yet) — F0-D2.
 * A validated `?next=` internal path wins over the default (spec F1-D6).
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, isPending } = useMe();
  const { activeId } = useActiveCompany();

  const state = location.state as { from?: string } | null;
  const next = safeInternalPath(new URLSearchParams(location.search).get('next'));

  if (isPending) return <BootSplash />;
  if (data) {
    return <Navigate to={state?.from ?? next ?? (activeId ? '/app' : '/')} replace />;
  }
  return <>{children}</>;
}

/**
 * /app requires an active space: 0 memberships → "/" (no-spaces screen);
 * several memberships and none active → "/" picker, preserving the requested
 * route in the state (AC-F0.6).
 */
export function RequireActiveCompany({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { memberships, activeId } = useActiveCompany();

  if (memberships.length === 0) return <Navigate to="/" replace />;
  if (!activeId) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/" replace state={{ from }} />;
  }
  return <>{children}</>;
}
