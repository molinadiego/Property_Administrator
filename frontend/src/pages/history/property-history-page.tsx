import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ApiError } from '@/api/errors';
import type { PropertyShareViewDto } from '@/api/types';
import { useMe } from '@/auth/session';
import { EmptyBox, ErrorBanner, ListSkeleton, formatDate } from '@/catalogs/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveCompany } from '@/companies/active-company';
import { useMembers } from '@/companies/members';
import { ORDER_STATUS_KEYS } from '@/dashboard/board';
import { FileList } from '@/history/files-ui';
import { JobAntecedents, QueryErrorState } from '@/history/history-ui';
import { usePropertyHistory, useRevokeShare, useShareHistory } from '@/history/queries';
import { ShareDialog, type ShareOption } from '@/pages/history/share-dialog';
import { ConfirmDialog } from '@/pages/orders/order-dialogs';

/**
 * Property history (spec F5 §2.4): the server-resolved `scope` (F5-D2) drives
 * the mode badge and the §7.5 share management (owner only); a 404 is the
 * «sin acceso» screen — existence is never leaked (§16.8). Order titles link
 * to the detail only under `full` (the other scopes may 404 there, F5-D4).
 */
export function PropertyHistoryPage() {
  const { t } = useTranslation(['history', 'orders', 'common', 'dashboard']);
  const { propertyId = '' } = useParams();
  const { activeId } = useActiveCompany();
  const companyId = activeId ?? '';
  const history = usePropertyHistory(companyId, propertyId);
  const members = useMembers(companyId);
  const { data: me } = useMe();
  const shareMutation = useShareHistory(companyId, propertyId);
  const revokeMutation = useRevokeShare(companyId);
  const [shareOpen, setShareOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PropertyShareViewDto | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  if (history.isPending) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('history:property.loading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ListSkeleton />
        </CardContent>
      </Card>
    );
  }

  const data = history.data;
  if (!data) {
    if (history.error instanceof ApiError && history.error.status === 404) {
      return (
        <Card className="min-w-0" role="region" aria-labelledby="property-history-title">
          <CardHeader>
            <h1 id="property-history-title" className="text-xl font-semibold">
              {t('history:property.notFoundTitle')}
            </h1>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('history:property.notFoundBody')}</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/history">{t('history:property.backToHistory')}</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <QueryErrorState
        error={history.error}
        fallback={t('history:property.error')}
        onRetry={() => void history.refetch()}
      />
    );
  }

  /** Resolves a share row/option label without leaking unresolvable ids (F4 pattern). */
  const memberLabel = (membershipId: string): string => {
    const member = (members.data ?? []).find((row) => row.membershipId === membershipId);
    if (member) return member.name;
    const own = (me?.memberships ?? []).find((row) => row.id === membershipId);
    if (own) return own.companyName;
    return t('history:share.externalMember');
  };

  // §7.5 dialog options: active members of the space + my memberships in other
  // spaces, minus the ones that already hold an active share (F5 §5; the 409
  // still covers races with another user).
  const sharedIds = new Set(data.shares.map((item) => item.sharedWithMembershipId));
  const shareOptions: ShareOption[] = [];
  const seen = new Set<string>();
  for (const member of members.data ?? []) {
    if (sharedIds.has(member.membershipId) || seen.has(member.membershipId)) continue;
    seen.add(member.membershipId);
    shareOptions.push({ value: member.membershipId, label: member.name });
  }
  for (const membership of me?.memberships ?? []) {
    if (membership.companyId === companyId) continue; // already listed above
    if (sharedIds.has(membership.id) || seen.has(membership.id)) continue;
    seen.add(membership.id);
    shareOptions.push({ value: membership.id, label: membership.companyName });
  }

  const scopeLabel =
    data.scope === 'full'
      ? t('history:property.scope.full')
      : data.scope === 'shared'
        ? t('history:property.scope.shared')
        : t('history:property.scope.ownJobs');

  return (
    <div className="space-y-4">
      <Card className="min-w-0" role="region" aria-labelledby="property-history-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="min-w-0 space-y-0.5">
            <h1 id="property-history-title" className="text-xl font-semibold">
              {data.property.addressLine}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data.property.city}, {data.property.state}
            </p>
          </div>
          <Badge variant={data.scope === 'full' ? 'default' : 'secondary'}>{scopeLabel}</Badge>
        </CardHeader>
      </Card>

      {data.scope === 'full' ? (
        <Card className="min-w-0" role="region" aria-labelledby="property-share-title">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div className="min-w-0 space-y-0.5">
              <CardTitle id="property-share-title">{t('history:share.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('history:share.description')}</p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                shareMutation.reset();
                setActionError(null);
                setShareOpen(true);
              }}
            >
              {t('history:share.shareButton')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <ErrorBanner error={actionError} fallback={t('history:share.actionFailed')} />
            {data.shares.length === 0 ? (
              <EmptyBox text={t('history:share.empty')} />
            ) : (
              <ul className="space-y-2" role="list">
                {data.shares.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border p-3"
                  >
                    <span className="min-w-0 flex-1 basis-40 text-sm font-medium">
                      {memberLabel(item.sharedWithMembershipId)}
                    </span>
                    {item.note ? (
                      <span
                        className="min-w-0 basis-64 truncate text-xs text-muted-foreground"
                        title={item.note}
                      >
                        {item.note}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {t('history:share.sharedAt', { date: formatDate(item.createdAt) })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActionError(null);
                        setRevokeTarget(item);
                      }}
                    >
                      {t('history:share.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="min-w-0" role="region" aria-labelledby="property-history-orders">
        <CardHeader>
          <CardTitle id="property-history-orders">{t('history:property.ordersTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.orders.length === 0 ? (
            <EmptyBox text={t('history:property.ordersEmpty')} />
          ) : (
            <ul className="space-y-3" role="list">
              {data.orders.map((order) => (
                <li key={order.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 basis-56 text-sm font-semibold">
                      {data.scope === 'full' ? (
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
                    <Badge variant="secondary">
                      {t(`dashboard:${ORDER_STATUS_KEYS[order.status]}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('orders:detail.createdAt', { date: formatDate(order.createdAt) })}
                    {order.closedAt
                      ? ` · ${t('orders:detail.closedAt', { date: formatDate(order.closedAt) })}`
                      : ''}
                  </p>
                  {order.parentOrderId ? (
                    <p className="text-xs text-muted-foreground">
                      {t('history:property.parentOrder')}
                    </p>
                  ) : null}
                  <ul className="space-y-1.5" role="list">
                    {order.jobs.map((job) => (
                      <JobAntecedents key={job.id} job={job} />
                    ))}
                  </ul>
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('history:files.title')}
                    </h4>
                    <FileList
                      files={order.files}
                      companyId={companyId}
                      emptyText={t('history:files.empty')}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        options={shareOptions}
        isPending={shareMutation.isPending}
        error={shareMutation.error}
        onConfirm={(input) =>
          shareMutation.mutate(input, { onSuccess: () => setShareOpen(false) })
        }
      />
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRevokeTarget(null);
        }}
        title={t('history:share.revokeTitle')}
        description={t('history:share.revokeDescription', {
          name: revokeTarget ? memberLabel(revokeTarget.sharedWithMembershipId) : '',
        })}
        confirmLabel={t('history:share.revokeConfirm')}
        isPending={revokeMutation.isPending}
        destructive
        onConfirm={() => {
          if (revokeTarget) {
            revokeMutation.mutate(revokeTarget.id, {
              onSuccess: () => setActionError(null),
              onError: (error) => setActionError(error),
            });
          }
        }}
      />
    </div>
  );
}
