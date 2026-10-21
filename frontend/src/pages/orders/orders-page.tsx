import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveCompany } from '@/companies/active-company';
import { useProperties } from '@/catalogs/queries';
import { EmptyBox, ErrorBanner, ListSkeleton, formatDate } from '@/catalogs/ui';
import { ORDER_STATUS_KEYS } from '@/dashboard/board';
import type { OrderStatus } from '@/api/types';
import { useOrders } from '@/orders/queries';

/** The five official states of §20.1 in their BE-2 R5 label order. */
const STATUS_FILTERS: OrderStatus[] = [
  'requested',
  'open',
  'in_progress',
  'completed',
  'cancelled',
];

/**
 * Order list (spec F4 §2.1, AC-F4.1/AC-F4.2): the visible orders of the
 * space — own ones plus the caller's cross-space assignments (§2.12) — with
 * the BE-1 filters (`status` chips + `assignment_status=pending` toggle) kept
 * in the query string. The address of each row is resolved from the cached
 * property list of the active space; foreign rows show no address because the
 * contract has no summary endpoint (F4-D2).
 */
export function OrdersPage() {
  const { t } = useTranslation(['orders', 'dashboard', 'common']);
  const { activeId } = useActiveCompany();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const mine = searchParams.get('mine') === 'pending';
  const filter = {
    ...(status ? { status } : {}),
    ...(mine ? ({ assignmentStatus: 'pending' } as const) : {}),
  };

  const orders = useOrders(activeId ?? '', filter);
  const properties = useProperties(activeId ?? '');

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(name);
    else next.set(name, value);
    setSearchParams(next, { replace: true });
  };

  const rows = orders.data ?? [];
  const filtered = status !== '' || mine;
  // The server caps the list at 100 (BE-1 §1.1); the page documents the cap.
  const capped = rows.length >= 100;
  const addressByProperty = new Map(
    (properties.data ?? []).map((property) => [property.id, property.addressLine]),
  );

  if (!activeId) return null;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="orders-title">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle id="orders-title" className="flex items-center gap-2">
          {t('orders:list.title')}
          {orders.data ? (
            <Badge variant="secondary">
              <span className="sr-only">
                {capped ? t('orders:list.countCapped') : t('orders:list.count', { count: rows.length })}
              </span>
              <span aria-hidden="true">{capped ? '100+' : rows.length}</span>
            </Badge>
          ) : null}
        </CardTitle>
        <Button asChild>
          <Link to="/app/orders/new">{t('orders:list.new')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div role="group" aria-label={t('orders:list.title')} className="flex flex-wrap gap-2">
            <Button
              variant={status === '' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={status === ''}
              onClick={() => setParam('status', null)}
            >
              {t('orders:list.filterAll')}
            </Button>
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                variant={status === value ? 'default' : 'outline'}
                size="sm"
                aria-pressed={status === value}
                onClick={() => setParam('status', status === value ? null : value)}
              >
                {t(`dashboard:${ORDER_STATUS_KEYS[value]}`)}
              </Button>
            ))}
          </div>
          <label className="flex w-fit items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={mine}
              onChange={(event) => setParam('mine', event.target.checked ? 'pending' : null)}
            />
            {t('orders:list.filterMine')}
          </label>
        </div>

        {orders.isPending ? (
          <ListSkeleton />
        ) : orders.error ? (
          <>
            <ErrorBanner error={orders.error} fallback={t('orders:list.error')} />
            <Button variant="outline" size="sm" onClick={() => void orders.refetch()}>
              {t('common:action.retry')}
            </Button>
          </>
        ) : rows.length === 0 && filtered ? (
          <>
            <EmptyBox text={t('orders:list.emptyFiltered')} />
            <Button variant="outline" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
              {t('orders:list.clearFilters')}
            </Button>
          </>
        ) : rows.length === 0 ? (
          <EmptyBox text={t('orders:list.empty')} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((order) => {
              const address = addressByProperty.get(order.propertyId);
              return (
                <li key={order.id}>
                  <Link
                    to={`/app/orders/${order.id}`}
                    aria-label={t('orders:list.openAria', { title: order.title })}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{order.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {address ? `${address} · ` : ''}
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {order.urgent ? (
                        <Badge variant="destructive">{t('orders:urgent')}</Badge>
                      ) : null}
                      <Badge variant="secondary">
                        {t(`dashboard:${ORDER_STATUS_KEYS[order.status]}`)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {capped ? (
          <p className="text-xs text-muted-foreground">{t('orders:list.countCapped')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
