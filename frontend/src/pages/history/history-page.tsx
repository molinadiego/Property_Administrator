import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import type { JobHistoryEntryViewDto } from '@/api/types';
import { useProperties } from '@/catalogs/queries';
import { EmptyBox, ListSkeleton, formatDate } from '@/catalogs/ui';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveCompany } from '@/companies/active-company';
import { ORDER_STATUS_KEYS } from '@/dashboard/board';
import { JobAntecedents, QueryErrorState } from '@/history/history-ui';
import { useManagedHistory, useMyJobHistory } from '@/history/queries';
import { cn } from '@/lib/utils';

/**
 * History hub (spec F5 §2.2/§2.3): two views behind `?tab=` — the space's
 * managed orders (§7.3, §7.4) and the caller's personal job history (§7.2).
 * Tabs are plain links with `aria-current` (F5-D4: no new dependency); links
 * out of the space view appear only for properties of the active space
 * (F4-D2 join) because foreign orders answer 404.
 */

type HistoryTab = 'space' | 'mine';

/** Tab «Del espaço»: every order the space manages or ever held (§7.3, §7.4). */
function SpaceHistory({ companyId }: { companyId: string }) {
  const { t } = useTranslation(['history', 'orders', 'dashboard', 'common']);
  const history = useManagedHistory(companyId);
  const properties = useProperties(companyId);

  if (history.isPending) return <ListSkeleton />;
  if (history.error) {
    return (
      <QueryErrorState
        error={history.error}
        fallback={t('history:space.error')}
        onRetry={() => void history.refetch()}
      />
    );
  }

  const orders = history.data.data;
  if (orders.length === 0) return <EmptyBox text={t('history:space.empty')} />;

  // Own-space properties (F4-D2 join): only those rows get links — foreign
  // managed orders show their data inline without navigation (F5-D4).
  const ownPropertyIds = new Set((properties.data ?? []).map((property) => property.id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('history:space.hint')}</p>
      <ul className="space-y-3" role="list">
        {orders.map((order) => {
          const isOwn = ownPropertyIds.has(order.property.id);
          const address = `${order.property.addressLine} · ${order.property.city}`;
          return (
            <li key={order.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 basis-56 text-sm font-semibold">
                  {isOwn ? (
                    <Link
                      to={`/app/orders/${order.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {order.title}
                    </Link>
                  ) : (
                    order.title
                  )}
                </h3>
                <Badge variant="secondary">{t(`dashboard:${ORDER_STATUS_KEYS[order.status]}`)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isOwn ? (
                  <Link
                    to={`/app/history/properties/${order.property.id}`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {address}
                  </Link>
                ) : (
                  address
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('orders:detail.createdAt', { date: formatDate(order.createdAt) })}
                {order.closedAt
                  ? ` · ${t('orders:detail.closedAt', { date: formatDate(order.closedAt) })}`
                  : ''}
              </p>
              <ul className="space-y-1.5" role="list">
                {order.jobs.map((job) => (
                  <JobAntecedents key={job.id} job={job} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tab «Mis trabajos»: session-scoped, any company, closed jobs included (§7.2). */
function MineHistory() {
  const { t } = useTranslation(['history', 'orders', 'common']);
  const history = useMyJobHistory();

  if (history.isPending) return <ListSkeleton />;
  if (history.error) {
    return (
      <QueryErrorState
        error={history.error}
        fallback={t('history:mine.error')}
        onRetry={() => void history.refetch()}
      />
    );
  }

  const rows: JobHistoryEntryViewDto[] = history.data.data;
  if (rows.length === 0) return <EmptyBox text={t('history:mine.empty')} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('history:mine.hint')}</p>
      <ul className="space-y-3" role="list">
        {rows.map((row) => (
          <li key={row.id} className="space-y-1.5 rounded-lg border border-border p-3">
            <Link
              to={`/app/history/properties/${row.property.id}`}
              className="text-sm font-semibold underline-offset-4 hover:underline"
            >
              {row.property.addressLine} · {row.property.city}
            </Link>
            <p className="text-sm">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {t('history:mine.orderAt', { title: row.order.title })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{t(`orders:jobStatus.${row.status}`)}</Badge>
              {row.assignmentStatus ? (
                <Badge variant="outline">{t(`orders:assignmentStatus.${row.assignmentStatus}`)}</Badge>
              ) : null}
            </div>
            <ul role="list">
              <JobAntecedents job={row} compact />
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistoryPage() {
  const { t } = useTranslation(['history', 'common']);
  const { activeId } = useActiveCompany();
  const companyId = activeId ?? '';
  const [searchParams] = useSearchParams();
  const tab: HistoryTab = searchParams.get('tab') === 'mine' ? 'mine' : 'space';

  const tabClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm',
      active
        ? 'bg-secondary font-medium text-secondary-foreground'
        : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <Card className="min-w-0" role="region" aria-labelledby="history-title">
      <CardHeader>
        <CardTitle id="history-title">{t('history:title')}</CardTitle>
        <nav aria-label={t('history:tabs.label')} className="flex gap-1.5">
          <Link
            to="/app/history?tab=space"
            aria-current={tab === 'space' ? 'page' : undefined}
            className={tabClass(tab === 'space')}
          >
            {t('history:tabs.space')}
          </Link>
          <Link
            to="/app/history?tab=mine"
            aria-current={tab === 'mine' ? 'page' : undefined}
            className={tabClass(tab === 'mine')}
          >
            {t('history:tabs.mine')}
          </Link>
        </nav>
      </CardHeader>
      <CardContent>
        {tab === 'space' ? <SpaceHistory companyId={companyId} /> : <MineHistory />}
      </CardContent>
    </Card>
  );
}
