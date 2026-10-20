import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';

import type { MembershipViewDto } from '@/api/types';
import { useActiveCompany } from '@/companies/active-company';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LogoutButton } from '@/layout/logout-button';

/** Space list shown when the user belongs to several spaces (AC-F0.5). */
function SpacePicker({
  memberships,
  activeId,
  onPick,
}: {
  memberships: MembershipViewDto[];
  activeId: string | null;
  onPick: (companyId: string) => void;
}) {
  const { t } = useTranslation('spaces');
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">{t('picker.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('picker.subtitle')}</p>
      <ul className="mt-4 grid gap-3">
        {memberships.map((membership) => (
          <li key={membership.companyId}>
            <button
              type="button"
              onClick={() => onPick(membership.companyId)}
              aria-label={membership.companyName}
              className={cn(
                'w-full rounded-xl border border-border bg-card p-4 text-left transition-colors',
                'hover:border-primary/60 hover:bg-accent/40',
                'focus-visible:outline-2 focus-visible:outline-ring',
                membership.companyId === activeId && 'border-primary',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {membership.companyName}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {membership.companyId === activeId ? (
                    <Badge variant="success">{t('picker.activeBadge')}</Badge>
                  ) : null}
                  <Badge variant="secondary">{t(`role.${membership.role}`)}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`type.${membership.companyType}`)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 0 memberships: exit screen (space creation lands in F1). */
function NoSpacesScreen() {
  const { t } = useTranslation('spaces');
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">{t('none.title')}</CardTitle>
          <CardDescription>{t('none.body')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton variant="outline" withText />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "/" route (spec F0 §6): 0 spaces → no-spaces screen; 1 space → straight into
 * the shell (auto-selected); N spaces → picker (F0-D1).
 */
export function RootRoute() {
  const { memberships, activeId, setActive } = useActiveCompany();
  const location = useLocation();
  const navigate = useNavigate();

  if (memberships.length === 0) return <NoSpacesScreen />;
  if (memberships.length === 1) return <Navigate to="/app" replace />;

  const state = location.state as { from?: string } | null;
  return (
    <SpacePicker
      memberships={memberships}
      activeId={activeId}
      onPick={(companyId) => {
        setActive(companyId);
        navigate(state?.from ?? '/app', { replace: true });
      }}
    />
  );
}
