import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList, FilePlus2, FolderTree, ReceiptText, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useActiveCompany } from '@/companies/active-company';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ORDER_STATUS_KEYS,
  notificationOrderPath,
  pendingAssignmentRows,
  spaceNotifications,
  spaceOrders,
  unreadNotificationCount,
  type PendingAssignmentRow,
} from '@/dashboard/board';
import {
  useAcceptAssignment,
  useMarkNotificationRead,
  useNotifications,
  useOpenOrders,
  usePendingOrders,
  useRejectAssignment,
} from '@/dashboard/queries';
import { useOrders } from '@/orders/queries';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Error banner for the dashboard mutations (RFC 7807 `detail`, spec F2 §5). */
function ErrorBanner({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('errors');
  if (!error) return null;
  const detail =
    error instanceof ApiError
      ? error.detail ?? (error.status === 0 ? t('network') : t('unknown'))
      : fallback;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {detail}
    </p>
  );
}

/** Loading state of one card; each card loads, errors and empties on its own (AC-F2.10). */
function CardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

/** Open orders of the space (F2-D1): status per BE-2 R5, urgent mark (§14.2). */
function OpenOrdersCard({ companyId, className }: { companyId: string; className?: string }) {
  const { t } = useTranslation(['dashboard', 'orders', 'common']);
  const orders = useOpenOrders(companyId);
  // Only the active space's orders render (§2.4); the cap check uses that set.
  const rows = spaceOrders(orders.data, companyId);
  // The server caps the list at 100 (BE-1 §1.1); the card documents the cap.
  const capped = rows.length >= 100;

  return (
    <Card className={cn('min-w-0', className)} role="region" aria-labelledby="open-orders-title">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle id="open-orders-title">{t('openOrders.title')}</CardTitle>
        {orders.data ? (
          <Badge variant="secondary">
            <span className="sr-only">
              {capped ? t('openOrders.countCapped') : t('openOrders.count', { count: rows.length })}
            </span>
            <span aria-hidden="true">{capped ? '100+' : rows.length}</span>
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.isPending ? (
          <CardSkeleton />
        ) : orders.error ? (
          <>
            <ErrorBanner error={orders.error} fallback={t('openOrders.error')} />
            <Button variant="outline" size="sm" onClick={() => void orders.refetch()}>
              {t('common:action.retry')}
            </Button>
          </>
        ) : rows.length === 0 ? (
          <EmptyBox text={t('openOrders.empty')} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/app/orders/${order.id}`}
                  aria-label={t('orders:list.openAria', { title: order.title })}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{order.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {order.urgent ? (
                      <Badge variant="destructive">{t('openOrders.urgent')}</Badge>
                    ) : null}
                    <Badge variant="secondary">{t(ORDER_STATUS_KEYS[order.status])}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Confirm-before-accept (F2-D3): accepted never goes back to proposed (§20.3). */
function AcceptAssignmentButton({
  row,
  disabled,
  isPending,
  onConfirm,
}: {
  row: PendingAssignmentRow;
  disabled: boolean;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(['dashboard', 'common']);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        disabled={disabled}
        aria-label={t('pending.acceptAria', { order: row.orderTitle })}
        onClick={() => setOpen(true)}
      >
        {t('pending.accept')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('acceptDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('acceptDialog.description', { job: row.jobTitle, order: row.orderTitle })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {t('acceptDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Reject with the optional reason (F2-D3, mirror of `RejectAssignmentDto` ≤1000). */
function RejectAssignmentButton({
  row,
  disabled,
  isPending,
  onConfirm,
}: {
  row: PendingAssignmentRow;
  disabled: boolean;
  isPending: boolean;
  onConfirm: (reason?: string) => void;
}) {
  const { t } = useTranslation(['dashboard', 'common']);
  const [open, setOpen] = useState(false);

  const schema = z.object({
    reason: z.string().max(1000, t('rejectDialog.reasonTooLong')),
  });
  type RejectValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RejectValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const onSubmit = handleSubmit((values) => {
    const reason = values.reason.trim();
    // Empty → sent without `reason` (spec F2 §6).
    onConfirm(reason || undefined);
    reset();
    setOpen(false);
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label={t('pending.rejectAria', { order: row.orderTitle })}
        onClick={() => setOpen(true)}
      >
        {t('pending.reject')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectDialog.title')}</DialogTitle>
            <DialogDescription>{t('rejectDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`reject-reason-${row.assignmentId}`}>
                {t('rejectDialog.reason')}
              </Label>
              <Textarea
                id={`reject-reason-${row.assignmentId}`}
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={
                  errors.reason ? `reject-reason-${row.assignmentId}-error` : undefined
                }
                {...register('reason')}
              />
              {errors.reason ? (
                <p
                  id={`reject-reason-${row.assignmentId}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.reason.message}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common:action.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {t('rejectDialog.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pending assignments of the member with accept/reject (F2-D2/D3, §5.6). */
function PendingCard({
  companyId,
  membershipIds,
  className,
}: {
  companyId: string;
  membershipIds: string[];
  className?: string;
}) {
  const { t } = useTranslation(['dashboard', 'common']);
  const pendingOrders = usePendingOrders(companyId);
  const accept = useAcceptAssignment(companyId);
  const reject = useRejectAssignment(companyId);
  const [actionError, setActionError] = useState<unknown>(null);

  // One row per own pending assignment of this space (F2-D2, §2.4).
  const rows = pendingAssignmentRows(pendingOrders.data, membershipIds, companyId);

  const runAction = async (action: Promise<unknown>) => {
    try {
      await action;
      setActionError(null);
    } catch (error) {
      // RFC 7807 detail below; the hooks already refresh both cards (AC-F2.6).
      setActionError(error);
    }
  };

  return (
    <Card className={cn('min-w-0', className)} role="region" aria-labelledby="pending-assignments-title">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle id="pending-assignments-title">{t('pending.title')}</CardTitle>
        {pendingOrders.data ? (
          <Badge variant="secondary">
            <span className="sr-only">{t('pending.count', { count: rows.length })}</span>
            <span aria-hidden="true">{rows.length}</span>
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingOrders.isPending ? (
          <CardSkeleton />
        ) : pendingOrders.error ? (
          <>
            <ErrorBanner error={pendingOrders.error} fallback={t('pending.error')} />
            <Button variant="outline" size="sm" onClick={() => void pendingOrders.refetch()}>
              {t('common:action.retry')}
            </Button>
          </>
        ) : rows.length === 0 ? (
          <EmptyBox text={t('pending.empty')} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((row) => (
              <li
                key={row.assignmentId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.orderTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('pending.job', { title: row.jobTitle })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AcceptAssignmentButton
                    row={row}
                    disabled={accept.isPending || reject.isPending}
                    isPending={accept.isPending}
                    onConfirm={() => void runAction(accept.mutateAsync(row.assignmentId))}
                  />
                  <RejectAssignmentButton
                    row={row}
                    disabled={accept.isPending || reject.isPending}
                    isPending={reject.isPending}
                    onConfirm={(reason) =>
                      void runAction(reject.mutateAsync({ assignId: row.assignmentId, reason }))
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <ErrorBanner error={actionError} fallback={t('actionFailed')} />
      </CardContent>
    </Card>
  );
}

/** In-app notifications of the active space + unread badge (F2-D4..D6, §14). */
function NotificationsCard({ companyId, className }: { companyId: string; className?: string }) {
  const { t } = useTranslation(['dashboard', 'common']);
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  // Loaded orders resolve `assignment` notifications to their order (F4-D6).
  const orders = useOrders(companyId, {});

  const loadedPages = notifications.data?.pages;
  // Only this space's notifications render or count (§2.4, F2-D5).
  const rows = spaceNotifications(loadedPages, companyId);
  const unread = unreadNotificationCount(rows);

  return (
    <Card className={cn('min-w-0', className)} role="region" aria-labelledby="notifications-title">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle id="notifications-title">{t('notifications.title')}</CardTitle>
        {loadedPages && unread > 0 ? (
          <Badge>
            <span className="sr-only">{t('notifications.unread', { count: unread })}</span>
            <span aria-hidden="true">{unread}</span>
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.isPending ? (
          <CardSkeleton />
        ) : notifications.error ? (
          <>
            <ErrorBanner error={notifications.error} fallback={t('notifications.error')} />
            <Button variant="outline" size="sm" onClick={() => void notifications.refetch()}>
              {t('common:action.retry')}
            </Button>
          </>
        ) : rows.length === 0 ? (
          <EmptyBox text={t('notifications.empty')} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((notification) => {
              // F4-D6: order notifications open their detail; assignment ones
              // resolve through the loaded orders, or stay plain text.
              const path = notificationOrderPath(notification, orders.data);
              const titleClass = notification.readAt
                ? 'text-sm text-foreground'
                : 'text-sm font-medium text-foreground';
              return (
                <li
                  key={notification.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  {path ? (
                    <Link
                      to={path}
                      className={`${titleClass} inline-block hover:underline focus-visible:outline-2 focus-visible:outline-ring`}
                    >
                      {notification.title}
                    </Link>
                  ) : (
                    <p className={titleClass}>{notification.title}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(notification.createdAt)}
                    </span>
                    {notification.readAt ? (
                      <Badge variant="secondary">{t('notifications.readState')}</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markRead.isPending}
                        aria-label={t('notifications.markReadAria', { title: notification.title })}
                        onClick={() => markRead.mutate(notification.id)}
                      >
                        {t('notifications.markRead')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {loadedPages && loadedPages.length > 0 ? (
          <p className="text-xs text-muted-foreground">{t('notifications.limitNote')}</p>
        ) : null}
        {notifications.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
          >
            {t('notifications.loadMore')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Quick links to existing sections of the shell (F2-D7); Miembros is owner-only. */
function Shortcuts() {
  const { t } = useTranslation(['dashboard', 'nav', 'spaces']);
  const { active } = useActiveCompany();

  const tiles = [
    { to: '/app/orders', label: t('nav:orders'), icon: ClipboardList },
    { to: '/app/orders/new', label: t('shortcuts.createOrder'), icon: FilePlus2 },
    { to: '/app/catalogs', label: t('nav:catalogs'), icon: FolderTree },
    { to: '/app/billing', label: t('nav:billing'), icon: ReceiptText },
    ...(active?.role === 'owner'
      ? [{ to: '/app/settings/members', label: t('spaces:members.title'), icon: Users }]
      : []),
  ];

  return (
    <nav aria-labelledby="shortcuts-heading" className="space-y-3">
      <h2 id="shortcuts-heading" className="text-base font-semibold text-foreground">
        {t('shortcuts.title')}
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.to}>
            <Link
              to={tile.to}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <tile.icon className="size-4 shrink-0" aria-hidden="true" />
              {tile.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Dashboard panel (spec F2 §2): header + three independent cards + shortcuts. */
function DashboardPanel({ companyId }: { companyId: string }) {
  const { t } = useTranslation(['dashboard']);
  const { active, memberships } = useActiveCompany();
  const membershipIds = memberships.map((membership) => membership.id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">{active?.companyName}</h1>
        {active ? (
          <Badge variant="secondary">{t(`spaceType.${active.companyType}`)}</Badge>
        ) : null}
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OpenOrdersCard companyId={companyId} />
        <PendingCard companyId={companyId} membershipIds={membershipIds} />
        <NotificationsCard companyId={companyId} className="md:col-span-2 xl:col-span-1" />
      </div>
      <Shortcuts />
    </div>
  );
}

/**
 * Dashboard screen (spec F2, `/app`, replaces the F0 placeholder): the active
 * space's open orders, the member's pending assignments and its in-app
 * notifications (§2.4, §2.12). Every list is decided by the server; the UI
 * only shapes what comes back.
 */
export function DashboardPage() {
  const { activeId } = useActiveCompany();
  if (!activeId) return null;
  return <DashboardPanel companyId={activeId} />;
}
